/* Python.exe worker: runs Pyodide (and optionally Z3 WASM) off the main thread.
 *
 * Z3 in the browser works like this:
 *   - z3w.js / z3w.wasm is a single-threaded Emscripten CLI build of Z3
 *     (cpitclaudel/z3.wasm). Each eval writes an .smt2 file into a fresh
 *     module instance's virtual FS and calls main().
 *   - The 17 MB wasm is compiled ONCE (async); each eval then instantiates
 *     it synchronously via the instantiateWasm hook. Synchronous
 *     instantiation of a precompiled module is allowed in workers
 *     (Chrome forbids it on the main thread for modules > 8 MB, which is
 *     why all of this lives here and not in base.html).
 *   - z3_pyodide (pure-Python wheel, vendored in /z3/) speaks SMT-LIB2 text
 *     to that eval function and exposes a z3py-compatible API. We alias it
 *     as `z3` and add a prove() shim, so blog snippets written for regular
 *     z3py run unchanged.
 *
 * Protocol (main -> worker): {kind:"init"} | {kind:"run", source}
 * Protocol (worker -> main): {kind:"status"|"out", text}
 *                            {kind:"ready"} | {kind:"fatal", message}
 *                            {kind:"done", result} | {kind:"error", message}
 */

var PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
var Z3_JS = "/z3/z3w.js";
var Z3_WASM = "/z3/z3w.wasm";
var Z3_WHEEL = "/z3/z3_pyodide-0.1.0-py3-none-any.whl";

/* Options prepended to every eval:
 *   - pp.decimal: print algebraic numbers as "0.8660254037?" instead of
 *     root-obj terms (matches what modern z3py prints).
 *   - rlimit: resource bound instead of :timeout. This old build's
 *     :timeout spawns a watchdog pthread, which a single-threaded
 *     Emscripten build cannot do (it aborts with a pthread_create error).
 * Note the wheel emits (reset) first; on this build (reset) preserves
 * these options, so prepending is safe. */
var Z3_OPTS =
  "(set-option :pp.decimal true)\n" +
  "(set-option :pp.decimal-precision 10)\n" +
  "(set-option :rlimit 100000000)\n";

var pyodideReady = null;
var z3Ready = null;
var z3Module = null; /* precompiled WebAssembly.Module */
var z3Binary = null; /* ArrayBuffer fallback if precompile failed */

function status(text) {
  postMessage({ kind: "status", text: text });
}

function loadPyodideOnce() {
  if (pyodideReady) return pyodideReady;
  status("Downloading Python runtime\u2026");
  pyodideReady = Promise.resolve()
    .then(function () {
      importScripts(PYODIDE_BASE + "pyodide.js");
      return self.loadPyodide({ indexURL: PYODIDE_BASE });
    })
    .catch(function (err) {
      pyodideReady = null; /* allow retry */
      throw err;
    });
  return pyodideReady;
}

/* Run one SMT2 input in a fresh instance (precompiled wasm, sync). */
function z3RunOnce(input) {
  var out = [];
  var opts = {
    ENVIRONMENT: "WORKER",
    noInitialRun: true,
    print: function (t) { out.push(t); },
    printErr: function (t) { out.push(t); },
  };
  if (z3Module) {
    opts.instantiateWasm = function (imports, cb) {
      var inst = new WebAssembly.Instance(z3Module, imports);
      cb(inst);
      return inst.exports;
    };
  } else {
    opts.wasmBinary = z3Binary;
  }
  var m = self.Z3(opts);
  m.FS.writeFile("/input.smt2", Z3_OPTS + input);
  try {
    m.callMain(["/input.smt2"]);
  } catch (e) {
    /* Emscripten's exit() throws; expected. */
  }
  return out.join("\n");
}

/* Synchronous Z3 eval with a nonlinear-arithmetic fallback.
 *
 * Z3 4.5's default (check-sat) does not auto-route nonlinear real
 * problems to nlsat the way modern z3py does: it either answers
 * "unknown" or tries to spawn a timer thread and aborts
 * ("pthread_create" in the output). When that happens, retry with the
 * qfnra-nlsat tactic, which decides nonlinear real arithmetic. Plain
 * (check-sat) stays as the first attempt because qfnra-nlsat is
 * useless for other theories (uninterpreted functions, etc.). */
function z3Eval(input) {
  var text = String(input);
  var out = z3RunOnce(text);
  var stuck = /pthread_create/.test(out) || /^unknown$/m.test(out);
  if (stuck && text.indexOf("(check-sat)") !== -1) {
    var retry = z3RunOnce(
      text.split("(check-sat)").join("(check-sat-using qfnra-nlsat)")
    );
    if (/^(sat|unsat)$/m.test(retry)) return retry;
  }
  return out;
}

function loadZ3Once(py) {
  if (z3Ready) return z3Ready;
  z3Ready = Promise.resolve()
    .then(function () {
      status("Downloading Z3 (~17 MB, first time only)\u2026");
      importScripts(Z3_JS);
      return fetch(Z3_WASM).then(function (r) {
        if (!r.ok) throw new Error("failed to fetch z3w.wasm: HTTP " + r.status);
        return r.arrayBuffer();
      });
    })
    .then(function (buf) {
      status("Compiling Z3\u2026");
      return WebAssembly.compile(buf).then(
        function (mod) { z3Module = mod; },
        function () { z3Binary = buf; /* per-call sync compile fallback */ }
      );
    })
    .then(function () {
      status("Installing z3 bindings\u2026");
      self._z3_eval = z3Eval;
      return py.loadPackage("micropip").then(function () {
        var micropip = py.pyimport("micropip");
        return micropip.install(self.location.origin + Z3_WHEEL);
      });
    })
    .then(function () {
      return loadPyodideOnce().then(function (py2) {
        return py2.runPythonAsync(Z3_BOOTSTRAP);
      });
    })
    .catch(function (err) {
      z3Ready = null; /* allow retry */
      throw err;
    });
  return z3Ready;
}

/* Wire z3_pyodide to the CLI backend, alias it as `z3`, add prove(),
 * and patch model-value printing to match regular z3py:
 *   - rationals print as fractions ("1/2", not "(/ 1 2)")
 *   - algebraic numbers print as "0.8660254037?" (the wheel's parser
 *     otherwise drops them, because Fraction() rejects the trailing "?")
 */
var Z3_BOOTSTRAP = [
  "import sys",
  "from js import _z3_eval",
  "from z3_pyodide._backend._base import Backend",
  "",
  "class _BlogBackend(Backend):",
  "    def eval_smtlib2(self, commands):",
  "        return str(_z3_eval(commands))",
  "    def reset(self):",
  "        pass",
  "    def close(self):",
  "        pass",
  "",
  "from z3_pyodide._context import Context, set_default_context",
  "set_default_context(Context(backend=_BlogBackend()))",
  "",
  "import z3_pyodide",
  "import z3_pyodide._model_parser as _mp",
  "from z3_pyodide._exprs import ArithRef, IntNumRef, RatNumRef",
  "from z3_pyodide._sorts import RealSort",
  "",
  "class _AlgebraicNumRef(ArithRef):",
  "    '''Display-only wrapper for pp.decimal output like 0.866025?'''",
  "    def __init__(self, token, ctx=None):",
  "        super().__init__(RealSort(ctx), smtlib_name=token, ctx=ctx)",
  "        self._token = token",
  "    def __repr__(self):",
  "        return self._token",
  "    def __str__(self):",
  "        return self._token",
  "    def as_decimal(self, prec=10):",
  "        return self._token",
  "",
  "_orig_parse_real = _mp._parse_real_value",
  "def _parse_real_value(v):",
  "    if isinstance(v, str) and v.endswith('?'):",
  "        return _AlgebraicNumRef(v)",
  "    if (isinstance(v, list) and len(v) == 2 and v[0] == '-'",
  "            and isinstance(v[1], str) and v[1].endswith('?')):",
  "        return _AlgebraicNumRef('-' + v[1])",
  "    return _orig_parse_real(v)",
  "_mp._parse_real_value = _parse_real_value",
  "",
  "RatNumRef.__repr__ = lambda self: self.as_string()",
  "RatNumRef.__str__ = lambda self: self.as_string()",
  "IntNumRef.__repr__ = lambda self: self.as_string()",
  "IntNumRef.__str__ = lambda self: self.as_string()",
  "",
  "def prove(claim):",
  "    from z3_pyodide import Solver, Not, unsat, sat",
  "    s = Solver()",
  "    s.add(Not(claim))",
  "    r = s.check()",
  "    if r == unsat:",
  "        print('proved')",
  "    elif r == sat:",
  "        print('counterexample')",
  "        print(s.model())",
  "    else:",
  "        print('failed to prove')",
  "",
  "z3_pyodide.prove = prove",
  "if 'prove' not in z3_pyodide.__all__:",
  "    z3_pyodide.__all__.append('prove')",
  "sys.modules['z3'] = z3_pyodide",
].join("\n");

var Z3_IMPORT_RE = /^\s*(from\s+z3\s+import|import\s+z3)\b/m;

function runSource(source) {
  return loadPyodideOnce().then(function (py) {
    var pre = Z3_IMPORT_RE.test(source) ? loadZ3Once(py) : Promise.resolve();
    return pre.then(function () {
      py.setStdout({ batched: function (s) { postMessage({ kind: "out", text: s }); } });
      py.setStderr({ batched: function (s) { postMessage({ kind: "out", text: s }); } });
      status("Running\u2026");
      /* Strip z3 imports before package resolution: z3 isn't a Pyodide
         package (we provide it ourselves), and this avoids a console warning. */
      var pkgSource = source.replace(/^\s*(from\s+z3\s+import.*|import\s+z3.*)$/gm, "");
      return py
        .loadPackagesFromImports(pkgSource)
        .then(function () { return py.runPythonAsync(source); })
        .then(function (result) {
          var text = null;
          if (result !== undefined && result !== null) {
            text = String(result);
            if (result && typeof result.destroy === "function") result.destroy();
          }
          postMessage({ kind: "done", result: text });
        });
    });
  });
}

self.onmessage = function (e) {
  var d = e.data || {};
  if (d.kind === "init") {
    loadPyodideOnce().then(
      function () { postMessage({ kind: "ready" }); },
      function (err) {
        postMessage({ kind: "fatal", message: String((err && err.message) || err) });
      }
    );
  } else if (d.kind === "run") {
    runSource(String(d.source || "")).catch(function (err) {
      postMessage({ kind: "error", message: String((err && err.message) || err) });
    });
  }
};

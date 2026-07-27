/* Benchmark the 0002 proof (cos/Euclid ranking equivalence, 9 vars) on Z3 4.5 wasm. */
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync("static/z3/z3w.js", "utf8");
const wasmBinary = fs.readFileSync("static/z3/z3w.wasm");
const sandbox = {
  console, process, Buffer, WebAssembly, TextDecoder,
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  Float32Array, Float64Array, ArrayBuffer, Math, Date, setTimeout, clearTimeout,
};
sandbox.self = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "z3w.js" });

function z3Eval(input, rlimit) {
  const out = [];
  const m = sandbox.Z3({
    noInitialRun: true, wasmBinary,
    print: (t) => out.push(t), printErr: (t) => out.push(t),
  });
  m.FS.writeFile("/input.smt2", `(set-option :rlimit ${rlimit})\n` + input);
  try { m.callMain(["/input.smt2"]); } catch (e) {}
  return out.join("\n");
}

/* Negation of: unit(q),unit(x),unit(y), q.x > q.y  =>  |q-x|^2 < |q-y|^2 */
const Q = `
(declare-const q1 Real)(declare-const q2 Real)(declare-const q3 Real)
(declare-const x1 Real)(declare-const x2 Real)(declare-const x3 Real)
(declare-const y1 Real)(declare-const y2 Real)(declare-const y3 Real)
(assert (= (+ (* q1 q1) (* q2 q2) (* q3 q3)) 1))
(assert (= (+ (* x1 x1) (* x2 x2) (* x3 x3)) 1))
(assert (= (+ (* y1 y1) (* y2 y2) (* y3 y3)) 1))
(assert (> (+ (* q1 x1) (* q2 x2) (* q3 x3)) (+ (* q1 y1) (* q2 y2) (* q3 y3))))
(assert (not (< (+ (* (- q1 x1) (- q1 x1)) (* (- q2 x2) (- q2 x2)) (* (- q3 x3) (- q3 x3)))
                (+ (* (- q1 y1) (- q1 y1)) (* (- q2 y2) (- q2 y2)) (* (- q3 y3) (- q3 y3))))))
(check-sat-using qfnra-nlsat)
`;

const rlimit = Number(process.argv[2] || 100000000);
const t0 = Date.now();
console.log(z3Eval(Q, rlimit));
console.log("elapsed ms:", Date.now() - t0, "rlimit:", rlimit);

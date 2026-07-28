/* Python.exe editor - lazy-loaded by main.js the first time the editor
   is opened (Start menu or a "Try me" button). Exposes window.MFEditor. */
(function () {
  var pyWin = document.querySelector('[data-win="pyedit"]');
  var pyCode = document.getElementById("pyedit-code");
  var pyHighlight = document.getElementById("pyedit-highlight");
  var pyGutter = document.getElementById("pyedit-gutter");
  var pyOut = document.getElementById("pyedit-output");
  var pyRunBtn = document.getElementById("pyedit-run");
  var pyStatusField = document.getElementById("pyedit-status");
  var pyTitleText = pyWin.querySelector(".title-bar-text");
  var pyWorker = null;
  var pyWorkerReady = null;
  var pyCurrentFile = null;

  var PY_DEFAULT = '# Welcome to Python.exe\n# Press F5 (or Run) to execute. File > Save writes to the virtual C:\\ drive.\n\nprint("Hello, World!")\n';

  function pyStatus(msg) {
    pyStatusField.textContent = msg;
  }

  /* Virtual file system: one folder, lives in localStorage */
  var PYFILES_KEY = "mf-pyfiles";
  function pyFsRead() {
    try {
      return JSON.parse(localStorage.getItem(PYFILES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function pyFsWrite(files) {
    try {
      localStorage.setItem(PYFILES_KEY, JSON.stringify(files));
      return true;
    } catch (e) {
      pyStatus("Write error on drive C: \u2014 disk full?");
      return false;
    }
  }

  function setPyTitle() {
    pyTitleText.textContent = (pyCurrentFile || "untitled.py") + " - Python.exe";
  }

  /* --- Syntax highlighting + line numbers --- */
  /* One combined regex; the token kind is decided by its first character:
     quote = string, # = comment, digit = number, letter = keyword */
  var PY_TOKEN_RE = /("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|#[^\n]*|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?)/g;

  function pyEscapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function pyTokenClass(tok) {
    var c = tok.charAt(0);
    if (c === '"' || c === "'") return "tok-string";
    if (c === "#") return "tok-comment";
    if (c >= "0" && c <= "9") return "tok-number";
    return "tok-keyword";
  }

  function pySyncScroll() {
    pyHighlight.scrollTop = pyCode.scrollTop;
    pyHighlight.scrollLeft = pyCode.scrollLeft;
    pyGutter.scrollTop = pyCode.scrollTop;
  }

  function pyRefresh() {
    var src = pyCode.value;
    var html = "";
    var last = 0;
    var m;
    PY_TOKEN_RE.lastIndex = 0;
    while ((m = PY_TOKEN_RE.exec(src)) !== null) {
      html += pyEscapeHtml(src.slice(last, m.index));
      html += '<span class="' + pyTokenClass(m[0]) + '">' + pyEscapeHtml(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    html += pyEscapeHtml(src.slice(last));
    /* Trailing newline so the last line always renders */
    pyHighlight.innerHTML = html + "\n";

    var lines = src.split("\n").length;
    var nums = "";
    for (var i = 1; i <= lines; i++) nums += i + "\n";
    pyGutter.textContent = nums;
    pySyncScroll();
  }

  function setPyCode(code) {
    pyCode.value = code;
    pyRefresh();
  }

  pyCode.addEventListener("input", pyRefresh);
  pyCode.addEventListener("scroll", pySyncScroll);

  /* --- File menu --- */
  var pyFileBtn = document.getElementById("pyedit-file-btn");
  var pyFileMenu = document.getElementById("pyedit-file-menu");

  function setFileMenu(open) {
    pyFileMenu.hidden = !open;
    pyFileBtn.setAttribute("aria-expanded", String(open));
  }

  pyFileBtn.addEventListener("click", function () {
    setFileMenu(pyFileMenu.hidden);
  });

  document.addEventListener("click", function (e) {
    if (pyFileMenu.hidden) return;
    if (pyFileBtn.contains(e.target) || pyFileMenu.contains(e.target)) return;
    setFileMenu(false);
  });

  /* --- Save As dialog --- */
  var pySaveAsDlg = document.getElementById("pyedit-saveas-dialog");
  var pySaveAsName = document.getElementById("pyedit-saveas-name");

  function pySaveAsOpen() {
    pySaveAsName.value = pyCurrentFile || "untitled.py";
    pySaveAsDlg.hidden = false;
    pySaveAsName.focus();
    pySaveAsName.select();
  }

  function pySaveCommit(name) {
    var files = pyFsRead();
    files[name] = pyCode.value;
    if (pyFsWrite(files)) {
      pyCurrentFile = name;
      setPyTitle();
      pyStatus("Saved C:\\" + name);
    }
    pySaveAsDlg.hidden = true;
    pyCode.focus();
  }

  /* Overwrite warning ("C:\foo.py already exists...") */
  var pyOverwriteDlg = document.getElementById("pyedit-overwrite-dialog");
  var pyOverwriteMsg = document.getElementById("pyedit-overwrite-msg");
  var pyPendingName = null;

  function pyOverwriteCancel() {
    pyOverwriteDlg.hidden = true;
    pyPendingName = null;
    /* Back to the Save As dialog to pick another name */
    pySaveAsName.focus();
    pySaveAsName.select();
  }

  function pySaveAsDo() {
    var name = pySaveAsName.value.trim();
    if (!name) return;
    if (!/\.py$/i.test(name)) name += ".py";
    /* Saving over a *different* existing file needs a nod first */
    if (name !== pyCurrentFile && (name in pyFsRead())) {
      pyPendingName = name;
      pyOverwriteMsg.textContent =
        "C:\\" + name + " already exists.\nDo you want to replace it?";
      pyOverwriteDlg.hidden = false;
      document.getElementById("pyedit-overwrite-yes").focus();
      return;
    }
    pySaveCommit(name);
  }

  function pySave() {
    if (!pyCurrentFile) {
      pySaveAsOpen();
      return;
    }
    var files = pyFsRead();
    files[pyCurrentFile] = pyCode.value;
    if (pyFsWrite(files)) pyStatus("Saved C:\\" + pyCurrentFile);
  }

  document.getElementById("pyedit-saveas-ok").addEventListener("click", pySaveAsDo);
  document.getElementById("pyedit-saveas-cancel").addEventListener("click", function () {
    pySaveAsDlg.hidden = true;
  });
  document.getElementById("pyedit-saveas-close").addEventListener("click", function () {
    pySaveAsDlg.hidden = true;
  });
  pySaveAsName.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      pySaveAsDo();
    }
  });
  pySaveAsDlg.addEventListener("keydown", function (e) {
    if (e.key === "Escape") pySaveAsDlg.hidden = true;
  });

  document.getElementById("pyedit-overwrite-yes").addEventListener("click", function () {
    pyOverwriteDlg.hidden = true;
    if (pyPendingName) pySaveCommit(pyPendingName);
    pyPendingName = null;
  });
  document.getElementById("pyedit-overwrite-no").addEventListener("click", pyOverwriteCancel);
  document.getElementById("pyedit-overwrite-close").addEventListener("click", pyOverwriteCancel);
  pyOverwriteDlg.addEventListener("keydown", function (e) {
    if (e.key === "Escape") pyOverwriteCancel();
  });

  /* --- Open dialog --- */
  var pyOpenDlg = document.getElementById("pyedit-open-dialog");
  var pyOpenList = document.getElementById("pyedit-open-list");

  function pyOpenRefreshList() {
    var names = Object.keys(pyFsRead()).sort();
    pyOpenList.innerHTML = "";
    if (!names.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "(no files on C:\\)";
      pyOpenList.appendChild(empty);
      pyOpenList.disabled = true;
      return;
    }
    pyOpenList.disabled = false;
    names.forEach(function (n) {
      var opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      pyOpenList.appendChild(opt);
    });
    pyOpenList.selectedIndex = 0;
  }

  function pyOpenDlgShow() {
    pyOpenRefreshList();
    pyOpenDlg.hidden = false;
    pyOpenList.focus();
  }

  function pyOpenDo() {
    var name = pyOpenList.value;
    var files = pyFsRead();
    if (!name || !(name in files)) return;
    setPyCode(files[name]);
    pyCurrentFile = name;
    setPyTitle();
    pyStatus("Opened C:\\" + name);
    pyOpenDlg.hidden = true;
    pyCode.focus();
  }

  document.getElementById("pyedit-open-ok").addEventListener("click", pyOpenDo);
  pyOpenList.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      pyOpenDo();
    }
  });
  document.getElementById("pyedit-open-delete").addEventListener("click", function () {
    var name = pyOpenList.value;
    if (!name) return;
    var files = pyFsRead();
    delete files[name];
    if (pyFsWrite(files)) {
      if (pyCurrentFile === name) {
        pyCurrentFile = null;
        setPyTitle();
      }
      pyStatus("Deleted C:\\" + name);
      pyOpenRefreshList();
    }
  });
  document.getElementById("pyedit-open-cancel").addEventListener("click", function () {
    pyOpenDlg.hidden = true;
  });
  document.getElementById("pyedit-open-close").addEventListener("click", function () {
    pyOpenDlg.hidden = true;
  });
  pyOpenDlg.addEventListener("keydown", function (e) {
    if (e.key === "Escape") pyOpenDlg.hidden = true;
  });

  /* --- File menu items --- */
  document.getElementById("pyedit-file-new").addEventListener("click", function () {
    setFileMenu(false);
    setPyCode("");
    pyCurrentFile = null;
    setPyTitle();
    pyStatus("New file");
    pyCode.focus();
  });
  document.getElementById("pyedit-file-open").addEventListener("click", function () {
    setFileMenu(false);
    pyOpenDlgShow();
  });
  document.getElementById("pyedit-file-save").addEventListener("click", function () {
    setFileMenu(false);
    pySave();
  });
  document.getElementById("pyedit-file-saveas").addEventListener("click", function () {
    setFileMenu(false);
    pySaveAsOpen();
  });

  function pyAppend(text) {
    pyOut.textContent += text;
    pyOut.scrollTop = pyOut.scrollHeight;
  }

  function loadRuntimeOnce() {
    if (pyWorkerReady) return pyWorkerReady;
    pyStatus("Downloading Python runtime\u2026");
    pyWin.classList.add("busy");
    pyWorkerReady = new Promise(function (resolve, reject) {
      var w;
      try {
        w = new Worker("/pyworker.js");
      } catch (e) {
        reject(e);
        return;
      }
      w.addEventListener("message", function (e) {
        var d = e.data || {};
        if (d.kind === "status") pyStatus(d.text);
        else if (d.kind === "ready") resolve(w);
        else if (d.kind === "fatal") reject(new Error(d.message));
      });
      w.addEventListener("error", function (e) {
        reject(new Error(e.message || "worker error"));
      });
      w.postMessage({ kind: "init" });
    }).then(
      function (w) {
        pyWorker = w;
        pyWin.classList.remove("busy");
        pyStatus("Ready");
        return w;
      },
      function (err) {
        pyWorkerReady = null; // allow retry
        pyWin.classList.remove("busy");
        pyStatus("Failed to load Python \u2014 check your connection");
        throw err;
      }
    );
    return pyWorkerReady;
  }

  function openPyEditor(code) {
    if (code != null) {
      /* Opened from a "Try me" button: load that snippet as a new file */
      setPyCode(code);
      pyCurrentFile = null;
      pyOut.textContent = "";
    } else if (!pyCode.value) {
      /* Opened from the Start menu with an empty buffer */
      setPyCode(PY_DEFAULT);
    }
    setPyTitle();
    pyWin.classList.remove("closed");
    pyWin.classList.remove("minimized");
    var b = window.MF.btnFor("pyedit");
    if (b) b.hidden = false;
    window.MF.activate("pyedit");
    loadRuntimeOnce().catch(function () {});
    pyCode.focus();
  }

  var pyRunning = false;
  function runPython() {
    if (pyRunning) return;
    pyRunning = true;
    pyRunBtn.disabled = true;
    var source = pyCode.value;
    loadRuntimeOnce()
      .then(function (w) {
        pyStatus("Running\u2026");
        if (pyOut.textContent) pyAppend("\n");
        var t0 = Date.now();
        return new Promise(function (resolve) {
          function onMsg(e) {
            var d = e.data || {};
            if (d.kind === "out") {
              pyAppend(d.text + "\n");
            } else if (d.kind === "status") {
              pyStatus(d.text);
            } else if (d.kind === "done") {
              if (d.result != null) pyAppend(d.result + "\n");
              pyStatus("Done in " + (Date.now() - t0) + " ms");
              cleanup();
            } else if (d.kind === "error") {
              pyAppend(d.message + "\n");
              pyStatus("Error \u2014 see output");
              cleanup();
            }
          }
          function cleanup() {
            w.removeEventListener("message", onMsg);
            resolve();
          }
          w.addEventListener("message", onMsg);
          w.postMessage({ kind: "run", source: source });
        });
      })
      .catch(function () { /* status already set by loader */ })
      .then(function () {
        pyRunning = false;
        pyRunBtn.disabled = false;
      });
  }

  pyRunBtn.addEventListener("click", runPython);
  document.getElementById("pyedit-clear").addEventListener("click", function () {
    pyOut.textContent = "";
    pyStatus("Ready");
  });

  pyWin.addEventListener("keydown", function (e) {
    if (e.key === "F5" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      runPython();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      pySave();
    }
  });

  /* Tab inserts spaces, like a real editor */
  pyCode.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      e.preventDefault();
      pyCode.setRangeText("    ", pyCode.selectionStart, pyCode.selectionEnd, "end");
      pyRefresh(); /* setRangeText fires no input event */
    }
  });

  window.MFEditor = { open: openPyEditor };
})();

(function () {
  var EDITOR_SRC =
    (document.currentScript && document.currentScript.dataset.editorSrc) || "/editor.js";
  var BROWSER_SRC =
    (document.currentScript && document.currentScript.dataset.browserSrc) || "/browser.js";

  var startBtn = document.getElementById("start-button");
  var startMenu = document.getElementById("start-menu");
  var shutdown = document.getElementById("shutdown");

  /* --- Settings --- */
  var SETTINGS_KEY = "mf-settings";
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* private browsing etc. */ }
  }
  var settings = loadSettings();

  function applyReadingWidth() {
    document.documentElement.style.setProperty(
      "--reading-width",
      (settings.readingWidth || 72) + "ch"
    );
  }
  applyReadingWidth();

  function tick() {
    var d = new Date();
    document.getElementById("clock").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  tick();
  setInterval(tick, 10000);

  /* --- Multi-window management --- */
  var windows = Array.prototype.slice.call(document.querySelectorAll(".app-window"));
  var taskBtns = Array.prototype.slice.call(document.querySelectorAll(".taskbar-task"));

  function winById(id) {
    return windows.filter(function (w) { return w.dataset.win === id; })[0];
  }
  function btnFor(id) {
    return taskBtns.filter(function (b) { return b.dataset.for === id; })[0];
  }
  function isVisible(w) {
    return !w.classList.contains("closed") && !w.classList.contains("minimized");
  }

  function activate(id) {
    windows.forEach(function (w) {
      var on = w.dataset.win === id;
      w.classList.toggle("front", on);
      w.querySelector(".title-bar").classList.toggle("inactive", !on);
    });
    taskBtns.forEach(function (b) {
      b.classList.toggle("active", b.dataset.for === id);
    });
  }

  function activateTopmost() {
    var candidates = windows.filter(isVisible);
    if (candidates.length) {
      activate(candidates[candidates.length - 1].dataset.win);
    } else {
      taskBtns.forEach(function (b) { b.classList.remove("active"); });
    }
  }

  windows.forEach(function (w) {
    var id = w.dataset.win;
    var titleBar = w.querySelector(".title-bar");
    var minBtn = w.querySelector('[aria-label="Minimize"]');
    var maxBtn = w.querySelector('[aria-label="Maximize"]');
    var closeBtn = w.querySelector('[aria-label="Close"]');

    w.addEventListener("pointerdown", function () {
      if (!w.classList.contains("front")) activate(id);
    });

    /* --- Dragging by the title bar --- */
    var offset = { x: 0, y: 0 };
    var drag = null;

    titleBar.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      if (e.button !== 0) return;
      if (w.classList.contains("maximized")) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: offset.x,
        baseY: offset.y,
        rect: w.getBoundingClientRect(),
      };
      try {
        titleBar.setPointerCapture(e.pointerId);
      } catch (err) {
        drag = null;
      }
    });

    titleBar.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      // Primary button no longer down means we missed the pointerup
      // (e.g. released outside the browser) - abandon the drag so the
      // window doesn't chase the cursor on hover
      if ((e.buttons & 1) === 0) {
        drag = null;
        return;
      }
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;

      // Keep the title bar reachable: at least 60px of the window on
      // screen horizontally, title bar between desktop top and taskbar
      var vw = document.documentElement.clientWidth;
      var vh = window.innerHeight - 34; // taskbar
      var minDx = 60 - drag.rect.right;
      var maxDx = vw - 60 - drag.rect.left;
      var minDy = -drag.rect.top;
      var maxDy = vh - 24 - drag.rect.top;
      dx = Math.min(Math.max(dx, minDx), maxDx);
      dy = Math.min(Math.max(dy, minDy), maxDy);

      offset.x = drag.baseX + dx;
      offset.y = drag.baseY + dy;
      w.style.transform = "translate(" + offset.x + "px, " + offset.y + "px)";
    });

    function endDrag() {
      drag = null;
    }
    titleBar.addEventListener("pointerup", endDrag);
    titleBar.addEventListener("pointercancel", endDrag);
    titleBar.addEventListener("lostpointercapture", endDrag);

    /* --- Resizing by the bottom-right grip --- */
    if (!w.classList.contains("dialog-window")) {
      var grip = document.createElement("div");
      grip.className = "resize-grip";
      grip.setAttribute("aria-hidden", "true");
      w.appendChild(grip);

      var resize = null;

      grip.addEventListener("pointerdown", function (e) {
        if (w.classList.contains("maximized")) return;
        if (e.button !== 0) return;
        e.preventDefault();
        resize = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          w: w.offsetWidth,
          h: w.offsetHeight,
        };
        // Freeze the current size before switching layout mode so a
        // plain tap on the grip doesn't make the window jump
        w.style.width = resize.w + "px";
        w.style.height = resize.h + "px";
        w.classList.add("resized");
        try {
          grip.setPointerCapture(e.pointerId);
        } catch (err) {
          resize = null;
        }
      });

      grip.addEventListener("pointermove", function (e) {
        if (!resize || e.pointerId !== resize.pointerId) return;
        if ((e.buttons & 1) === 0) {
          resize = null;
          return;
        }
        var vw = document.documentElement.clientWidth;
        var vh = window.innerHeight - 34; // taskbar
        var width = Math.min(Math.max(resize.w + e.clientX - resize.startX, 280), vw);
        var height = Math.min(Math.max(resize.h + e.clientY - resize.startY, 140), vh);
        w.style.width = width + "px";
        w.style.height = height + "px";
      });

      function endResize() {
        resize = null;
      }
      grip.addEventListener("pointerup", endResize);
      grip.addEventListener("pointercancel", endResize);
      grip.addEventListener("lostpointercapture", endResize);
    }

    minBtn.addEventListener("click", function () {
      w.classList.add("minimized");
      activateTopmost();
    });

    function toggleMaximized() {
      var on = w.classList.toggle("maximized");
      maxBtn.setAttribute("aria-label", on ? "Restore" : "Maximize");
      activate(id);
    }

    maxBtn.addEventListener("click", toggleMaximized);

    titleBar.addEventListener("dblclick", function (e) {
      if (e.target.closest("button")) return;
      toggleMaximized();
    });

    closeBtn.addEventListener("click", function () {
      w.classList.add("closed");
      var b = btnFor(id);
      if (b) b.hidden = true;
      activateTopmost();
    });
  });

  taskBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.for;
      var w = winById(id);
      if (!w) return;
      if (w.classList.contains("minimized")) {
        w.classList.remove("minimized");
        activate(id);
      } else if (b.classList.contains("active")) {
        w.classList.add("minimized");
        activateTopmost();
      } else {
        activate(id);
      }
    });
  });

  /* Start maximized (after wiring, so button labels stay in sync).
     Small screens default to maximized; the Control Panel setting
     still wins in both directions once the user has touched it. */
  var smallScreen = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
  function wantsStartMaximized() {
    if (typeof settings.startMaximized === "boolean") return settings.startMaximized;
    return smallScreen;
  }
  if (wantsStartMaximized()) {
    var mainWin = document.querySelector(".main-window");
    if (mainWin) {
      mainWin.classList.add("maximized");
      var mainMaxBtn = mainWin.querySelector('[aria-label="Maximize"]');
      if (mainMaxBtn) mainMaxBtn.setAttribute("aria-label", "Restore");
    }
  }
  /* The real .maximized class is applied now; drop the pre-paint hint
     (set by the inline head script) so Restore works normally. */
  document.documentElement.classList.remove("start-maximized");

  /* --- Desktop icons --- */
  var icons = Array.prototype.slice.call(document.querySelectorAll(".desktop-icon"));

  function deselectIcons() {
    icons.forEach(function (i) { i.classList.remove("selected"); });
  }

  icons.forEach(function (icon) {
    icon.addEventListener("click", function (e) {
      e.stopPropagation();
      deselectIcons();
      icon.classList.add("selected");
    });
    icon.addEventListener("dblclick", function () {
      launchIcon(icon);
    });
    icon.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launchIcon(icon);
      }
    });
  });

  function launchIcon(icon) {
    if (icon.dataset.app === "browser") openBrowser();
    else location.href = icon.dataset.href;
  }

  document.getElementById("desktop").addEventListener("click", function (e) {
    if (!e.target.closest(".desktop-icon")) deselectIcons();
  });

  /* --- Post table rows (any window) --- */
  document.querySelectorAll("tr[data-href]").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      location.href = row.dataset.href;
    });
  });

  /* --- Start menu --- */
  function setStartMenu(open) {
    startMenu.hidden = !open;
    startBtn.classList.toggle("pressed", open);
    startBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      var first = startMenu.querySelector("[aria-current=page]") ||
        startMenu.querySelector("[role=menuitem]");
      if (first) first.focus();
    }
  }

  startBtn.addEventListener("click", function () {
    setStartMenu(startMenu.hidden);
  });

  document.addEventListener("click", function (e) {
    if (startMenu.hidden) return;
    if (startMenu.contains(e.target) || startBtn.contains(e.target)) return;
    setStartMenu(false);
  });

  startMenu.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(startMenu.querySelectorAll("[role=menuitem]"));
    var idx = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      setStartMenu(false);
      startBtn.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    }
  });

  /* --- Control Panel --- */
  var cpWin = document.getElementById("control-panel");
  var cpWidth = document.getElementById("cp-width");
  var cpWidthValue = document.getElementById("cp-width-value");
  var cpMaximized = document.getElementById("cp-maximized");
  var cpModem = document.getElementById("cp-modem");

  function cpSyncControls() {
    cpWidth.value = settings.readingWidth || 72;
    cpWidthValue.textContent = cpWidth.value;
    cpMaximized.checked = wantsStartMaximized();
    cpModem.checked = settings.modemSound !== false;
  }

  function cpOpen() {
    cpSyncControls();
    cpWin.hidden = false;
    cpWidth.focus();
  }

  function cpClose(save) {
    if (save) {
      settings.readingWidth = Number(cpWidth.value);
      settings.startMaximized = cpMaximized.checked;
      settings.modemSound = cpModem.checked;
      saveSettings();
    }
    applyReadingWidth(); // reverts live preview unless saved
    cpWin.hidden = true;
  }

  document.getElementById("menu-control-panel").addEventListener("click", function () {
    setStartMenu(false);
    cpOpen();
  });

  /* Live preview while dragging the slider */
  cpWidth.addEventListener("input", function () {
    cpWidthValue.textContent = cpWidth.value;
    document.documentElement.style.setProperty("--reading-width", cpWidth.value + "ch");
  });

  document.getElementById("cp-ok").addEventListener("click", function () { cpClose(true); });
  document.getElementById("cp-cancel").addEventListener("click", function () { cpClose(false); });
  document.getElementById("cp-close").addEventListener("click", function () { cpClose(false); });
  document.getElementById("cp-defaults").addEventListener("click", function () {
    cpWidth.value = 72;
    cpWidthValue.textContent = "72";
    cpMaximized.checked = false;
    cpModem.checked = true;
    document.documentElement.style.setProperty("--reading-width", "72ch");
  });

  cpWin.addEventListener("keydown", function (e) {
    if (e.key === "Escape") cpClose(false);
  });

  /* --- Python editor (lazy-loaded) --- */
  /* The editor's code (syntax highlighting, virtual FS, Pyodide glue)
     lives in editor.js and is only fetched the first time it's opened. */
  window.MF = { activate: activate, btnFor: btnFor };

  var editorPromise = null;
  function loadEditor() {
    if (window.MFEditor) return Promise.resolve(window.MFEditor);
    if (editorPromise) return editorPromise;
    editorPromise = loadScript(EDITOR_SRC, function () { return window.MFEditor; })
      .catch(function (err) {
        editorPromise = null; // allow retry
        throw err;
      });
    return editorPromise;
  }

  function loadScript(src, getApi) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        var api = getApi();
        if (api) resolve(api);
        else reject(new Error("script failed to initialize"));
      };
      s.onerror = function () {
        reject(new Error("failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function openPyEditor(code) {
    loadEditor().then(
      function (editor) { editor.open(code); },
      function () {
        var status = document.getElementById("pyedit-status");
        if (status) status.textContent = "Failed to load editor \u2014 check your connection";
      }
    );
  }

  /* Start menu entry */
  document.getElementById("menu-python").addEventListener("click", function () {
    setStartMenu(false);
    openPyEditor(null);
  });

  /* --- The Internet (lazy-loaded browser + modem theater) --- */
  var browserPromise = null;
  function openBrowser() {
    if (window.MFBrowser) {
      window.MFBrowser.open();
      return;
    }
    if (!browserPromise) {
      browserPromise = loadScript(BROWSER_SRC, function () { return window.MFBrowser; })
        .catch(function (err) {
          browserPromise = null; // allow retry
          throw err;
        });
    }
    browserPromise.then(
      function (browser) { browser.open(); },
      function () {
        var status = document.getElementById("browser-status");
        if (status) status.textContent = "Failed to load \u2014 no dial tone";
      }
    );
  }

  document.getElementById("menu-internet").addEventListener("click", function () {
    setStartMenu(false);
    openBrowser();
  });

  /* "Try me" buttons on Python code blocks */
  document
    .querySelectorAll('#content pre > code[data-lang="python"], #content pre > code[data-lang="py"]')
    .forEach(function (code) {
      var pre = code.parentElement;
      var wrap = document.createElement("div");
      wrap.className = "tryme-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tryme-btn";
      btn.innerHTML = "&#9654; Try me";
      btn.setAttribute("aria-label", "Open this code in the Python editor");
      btn.addEventListener("click", function () {
        openPyEditor(code.textContent.replace(/\n$/, ""));
      });
      wrap.appendChild(btn);
    });

  /* --- Shut Down... --- */
  document.getElementById("menu-shutdown").addEventListener("click", function () {
    setStartMenu(false);
    shutdown.hidden = false;
    document.body.classList.add("shut-down");
  });

  shutdown.addEventListener("click", function () {
    shutdown.hidden = true;
    document.body.classList.remove("shut-down");
  });

  /* --- Service worker (production only) ---
     Dev builds skip the fingerprint step, so sw.js still holds its
     unfilled placeholders there; never register it locally. */
  if (
    "serviceWorker" in navigator &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    window.addEventListener("load", function () {
      /* If the page was already controlled, a controllerchange means a
         new release took over (the new worker calls skipWaiting +
         clients.claim). On first install the page starts uncontrolled,
         so no dialog shows on a first visit. */
      var wasControlled = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register("/sw.js");
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (wasControlled) showUpdateDialog();
        wasControlled = true;
      });
    });
  }

  function showUpdateDialog() {
    var dialog = document.getElementById("update-dialog");
    if (!dialog || !dialog.hidden) return;

    function close() {
      dialog.hidden = true;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }

    document.getElementById("update-yes").addEventListener("click", function () {
      location.reload();
    });
    document.getElementById("update-no").addEventListener("click", close);
    document.getElementById("update-close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    dialog.hidden = false;
    document.getElementById("update-yes").focus();
  }
})();

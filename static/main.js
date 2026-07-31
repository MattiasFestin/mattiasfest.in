(function () {
  var EDITOR_SRC =
    (document.currentScript && document.currentScript.dataset.editorSrc) || "/editor.js";
  var BROWSER_SRC =
    (document.currentScript && document.currentScript.dataset.browserSrc) || "/browser.js";
  var WINAMP_SRC =
    (document.currentScript && document.currentScript.dataset.winampSrc) || "/winamp.js";
  var SCREENSAVER_SRC =
    (document.currentScript && document.currentScript.dataset.screensaverSrc) ||
    "/screensaver.js";
  var CLIPPY_SRC =
    (document.currentScript && document.currentScript.dataset.clippySrc) || "/clippy.js";
  var FIND_SRC =
    (document.currentScript && document.currentScript.dataset.findSrc) || "/find.js";

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
      (settings.readingWidth || 80) + "ch"
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
  /* Both lists grow and shrink at runtime: opening a post brings the
     blog folder along as a background window, and leaving the post
     takes it away again (see "Opening pages" below). */
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
      var on = b.dataset.for === id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function activateTopmost() {
    var candidates = windows.filter(isVisible);
    if (candidates.length) {
      /* Background windows (blog behind a post) sit after <main> in the
         DOM for reading order, but should never win the "topmost"
         heuristic over a regular window. */
      var fg = candidates.filter(function (w) {
        return !w.classList.contains("background-window");
      });
      var pool = fg.length ? fg : candidates;
      activate(pool[pool.length - 1].dataset.win);
    } else {
      taskBtns.forEach(function (b) {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
    }
  }

  /* After a window is minimized or closed its controls disappear, which
     would drop keyboard focus on <body>; park it on a sensible taskbar
     button instead so keyboard/screen-reader users don't get lost. */
  function focusTaskbarFallback(preferredId) {
    var b = preferredId && btnFor(preferredId);
    if (b && !b.hidden) {
      b.focus();
      return;
    }
    var active = taskBtns.filter(function (x) {
      return x.classList.contains("active") && !x.hidden;
    })[0];
    (active || startBtn).focus();
  }

  function wireWindow(w) {
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
      focusTaskbarFallback(id);
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
      focusTaskbarFallback(null);
    });
  }
  windows.forEach(wireWindow);

  function wireTask(b) {
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
  }
  taskBtns.forEach(wireTask);

  /* A window that arrives with a page joins the desktop on exactly the
     same terms as the ones that shipped with the document: draggable,
     resizable, minimizable, and visible to the app registry. */
  function adoptWindow(w) {
    windows.push(w);
    wireWindow(w);
    watchWindow(w);
  }

  function dropWindow(w) {
    var i = windows.indexOf(w);
    if (i >= 0) windows.splice(i, 1);
    if (w.parentNode) w.parentNode.removeChild(w);
  }

  function adoptTask(b) {
    taskBtns.push(b);
    wireTask(b);
    watchTask(b);
  }

  function dropTask(b) {
    var i = taskBtns.indexOf(b);
    if (i >= 0) taskBtns.splice(i, 1);
    if (b.parentNode) b.parentNode.removeChild(b);
  }

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
    else if (icon.dataset.app === "winamp") openWinamp();
    else go(icon.dataset.href, true);
  }

  document.getElementById("desktop").addEventListener("click", function (e) {
    if (!e.target.closest(".desktop-icon")) deselectIcons();
  });

  /* --- Desktop context menu --- */
  /* Right-clicking a Win98 desktop and getting the browser's own menu
     is the loudest break in the illusion. Only the bare desktop is
     hijacked: inside windows the native menu (copy, view source, open
     link in new tab) is far more useful than any homage. */
  var deskMenu = document.getElementById("desktop-menu");
  var desktopEl = document.getElementById("desktop");
  /* Original DOM order, so "Line up Icons" has something to restore. */
  var iconOrder = icons.slice();

  function deskMenuItems() {
    return Array.prototype.slice.call(deskMenu.querySelectorAll("[role=menuitem]"));
  }

  var deskMenuOpener = null;

  function openDeskMenu(x, y) {
    deskMenuOpener = document.activeElement;
    deskMenu.hidden = false;
    /* Measure only once visible, then flip back over the click point
       near an edge - exactly what the real menus did. */
    var r = deskMenu.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight - 34; /* taskbar */
    if (x + r.width > vw) x = Math.max(0, x - r.width);
    if (y + r.height > vh) y = Math.max(0, y - r.height);
    deskMenu.style.left = x + "px";
    deskMenu.style.top = y + "px";
    var first = deskMenuItems()[0];
    if (first) first.focus();
  }

  function closeDeskMenu(refocus) {
    if (deskMenu.hidden) return;
    deskMenu.hidden = true;
    if (!refocus) return;
    /* Same contract as the dialogs: hand focus back where it came from,
       falling back to the Start button when that element is gone. */
    var opener = deskMenuOpener;
    deskMenuOpener = null;
    if (opener && document.contains(opener) && opener.focus) {
      opener.focus();
      if (document.activeElement === opener) return;
    }
    startBtn.focus();
  }

  function runDeskCommand(cmd) {
    if (cmd === "arrange" || cmd === "lineup") {
      var wrap = document.querySelector(".desktop-icons");
      var order = iconOrder.slice();
      if (cmd === "arrange") {
        order.sort(function (a, b) {
          return a.querySelector(".desktop-icon-label").textContent.localeCompare(
            b.querySelector(".desktop-icon-label").textContent
          );
        });
      }
      order.forEach(function (i) { wrap.appendChild(i); });
    } else if (cmd === "refresh") {
      /* F5 on the desktop repainted the icons with a visible blink. */
      desktopEl.classList.add("refreshing");
      setTimeout(function () { desktopEl.classList.remove("refreshing"); }, 130);
    } else if (cmd === "properties") {
      /* Desktop > Properties was Display Properties; ours opens on the
         Screen Saver control, which is the interesting half. */
      cpOpen(document.getElementById("cp-saver"));
    }
  }

  desktopEl.addEventListener("contextmenu", function (e) {
    if (e.target.closest(".app-window, .desktop-icon, .assistant")) return;
    e.preventDefault();
    setStartMenu(false);
    deselectIcons();
    openDeskMenu(e.clientX, e.clientY);
  });

  deskMenu.addEventListener("click", function (e) {
    var item = e.target.closest("[role=menuitem]");
    if (!item) return;
    if (item.getAttribute("aria-disabled") === "true") return;
    closeDeskMenu(false);
    runDeskCommand(item.dataset.cmd);
  });

  deskMenu.addEventListener("keydown", function (e) {
    var items = deskMenuItems();
    var idx = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      closeDeskMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  });

  document.addEventListener("click", function (e) {
    if (deskMenu.hidden || deskMenu.contains(e.target)) return;
    closeDeskMenu(false);
  });

  /* Keyboard equivalent of a right-click, but only when focus is out on
     the desktop itself - inside a window the native menu still wins. */
  document.addEventListener("keydown", function (e) {
    var wanted = e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
    if (!wanted || !deskMenu.hidden) return;
    var a = document.activeElement;
    if (a && a.closest(".app-window, .popup-dialog, .start-menu, .taskbar, .assistant")) return;
    e.preventDefault();
    var r = desktopEl.getBoundingClientRect();
    openDeskMenu(r.left + 24, r.top + 24);
  });

  /* --- Post table rows (any window) --- */
  /* Delegated, because the rows come and go with the page: the blog
     folder behind a post is fetched and inserted long after this runs.
     Scoped to .post-table so Find's own result rows keep their Explorer
     manners (single click selects, double click opens). */
  document.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var row = e.target.closest(".post-table tr[data-href]");
    if (!row) return;
    go(row.dataset.href, true);
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
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  });

  /* Menus close when keyboard focus leaves them (e.g. Tab), per the
     menu pattern; the document click handler covers pointer users. */
  startMenu.addEventListener("focusout", function (e) {
    if (startMenu.hidden || !e.relatedTarget) return;
    if (startMenu.contains(e.relatedTarget) || startBtn.contains(e.relatedTarget)) return;
    setStartMenu(false);
  });

  /* --- Popup dialog focus management --- */
  /* Dialogs remember what had focus when they opened and hand it back
     on close, so keyboard and screen-reader users return to where they
     were instead of being dropped at the top of the page. */
  var dialogOpener = null;

  function openPopup(dialog, focusTarget) {
    dialogOpener = document.activeElement;
    dialog.hidden = false;
    var target = focusTarget || dialog.querySelector("button");
    if (target) target.focus();
  }

  function closePopup(dialog) {
    dialog.hidden = true;
    var opener = dialogOpener;
    dialogOpener = null;
    if (opener && document.contains(opener) && opener.focus) {
      opener.focus();
      if (document.activeElement === opener) return;
    }
    /* Opener gone or unfocusable (e.g. an item in the now-hidden Start
       menu): the Start button is the stable landmark to return to. */
    startBtn.focus();
  }

  /* --- Control Panel --- */
  var cpWin = document.getElementById("control-panel");
  var cpWidth = document.getElementById("cp-width");
  var cpWidthValue = document.getElementById("cp-width-value");
  var cpMaximized = document.getElementById("cp-maximized");
  var cpModem = document.getElementById("cp-modem");
  var cpFaithful = document.getElementById("cp-faithful");
  var cpSaver = document.getElementById("cp-saver");
  var cpSaverWait = document.getElementById("cp-saver-wait");
  var cpAssistant = document.getElementById("cp-assistant");

  /* Faithful '98 defaults to on; the pre-paint head script turns the
     default off when it detects a likely visually impaired user (see
     base.html). A saved boolean is an explicit user choice and wins. */
  function faithfulDefault() {
    return window.MFFaithfulDefault !== false;
  }
  function faithfulOn() {
    return typeof settings.faithful98 === "boolean" ? settings.faithful98 : faithfulDefault();
  }
  function applyFaithful() {
    document.documentElement.classList.toggle("faithful-98", faithfulOn());
  }

  function cpSyncControls() {
    cpWidth.value = settings.readingWidth || 80;
    cpWidthValue.textContent = cpWidth.value;
    cpMaximized.checked = wantsStartMaximized();
    cpModem.checked = settings.modemSound !== false;
    cpFaithful.checked = faithfulOn();
    cpSaver.value = saverMode(false);
    cpSaverWait.value = saverWait();
    cpAssistant.checked = assistantOn();
  }

  function cpOpen(focusTarget) {
    cpSyncControls();
    openPopup(cpWin, focusTarget || cpWidth);
  }

  function cpClose(save) {
    if (save) {
      settings.readingWidth = Number(cpWidth.value);
      settings.startMaximized = cpMaximized.checked;
      settings.modemSound = cpModem.checked;
      settings.faithful98 = cpFaithful.checked;
      settings.screensaver = cpSaver.value;
      settings.screensaverWait = Number(cpSaverWait.value);
      settings.assistant = cpAssistant.checked;
      saveSettings();
      applyFaithful();
      applyAssistant();
      resetIdle();
    }
    applyReadingWidth(); // reverts live preview unless saved
    closePopup(cpWin);
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
    cpWidth.value = 80;
    cpWidthValue.textContent = "80";
    cpMaximized.checked = false;
    cpModem.checked = true;
    cpFaithful.checked = faithfulDefault();
    cpSaver.value = SAVER_DEFAULT;
    cpSaverWait.value = SAVER_WAIT_DEFAULT;
    cpAssistant.checked = false;
    document.documentElement.style.setProperty("--reading-width", "80ch");
  });

  /* Preview runs the saver for real, the way the Display Properties
     button did - move the mouse and you're back. */
  document.getElementById("cp-saver-preview").addEventListener("click", function () {
    startScreensaver(cpSaver.value === "none" ? SAVER_DEFAULT : cpSaver.value);
  });

  cpWin.addEventListener("keydown", function (e) {
    if (e.key === "Escape") cpClose(false);
  });

  /* --- Apps: one interface to every window --- */
  /* The desktop knows what is open, what it is called and what is in
     it; until now nothing could ask. So every window answers the same
     four questions:

       id         which window this is
       title()    what its title bar says
       state()    "open" | "minimized" | "closed"
       content()  what is inside it, as plain data

     Title and state are read off the markup, so a window that
     registers nothing at all - the blog folder sitting behind a post -
     still answers truthfully. A lazy app fills in a content() of its
     own as it loads (editor.js, browser.js, winamp.js, find.js), and
     the main window's content is the document itself, surveyed below.

     The Office Assistant is the only consumer, and the reason any of
     this exists: a paperclip that recommends the Run button on a post
     with no code in it, or offers to launch a Winamp that is already
     playing, isn't helping - it's guessing. Nothing here costs anything
     until it's asked: the survey is taken once, lazily, and the
     observer that reports changes is only created if someone
     subscribes. */

  var contentEl = document.getElementById("content");

  /* Runnable snippets. The survey below hands the first one to the
     Assistant and the "Try me" buttons are wired to all of them, so the
     question "is there Python on this page" has exactly one answer.
     Recomputed whenever the main window opens a different document. */
  var pyBlocks = [];
  function findPyBlocks() {
    pyBlocks = Array.prototype.slice.call(
      document.querySelectorAll(
        '#content pre > code[data-lang="python"], #content pre > code[data-lang="py"]'
      )
    );
  }
  findPyBlocks();

  /* --- Animated math figures ---
     Manim clips have no sound and start muted, but decoding three of them
     below the fold would still be wasteful. Play only figures which are in
     the reader's window, honour reduced-motion, and rerun the wiring after
     client-side navigation swaps article content. */
  var manimObserver = null;

  function formatManimTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    var minutes = Math.floor(seconds / 60);
    var remainder = String(seconds % 60);
    return minutes + ":" + (remainder.length < 2 ? "0" : "") + remainder;
  }

  function wireManimPlayerControls(video) {
    if (video.dataset.manimPlayerWired) return;
    var player = video.closest(".manim-player");
    if (!player) return;

    var play = player.querySelector('[data-manim-action="play"]');
    var stop = player.querySelector('[data-manim-action="stop"]');
    var pause = player.querySelector('[data-manim-action="pause"]');
    var scrubber = player.querySelector(".manim-player-scrubber");
    var time = player.querySelector(".manim-player-time");
    if (!play || !stop || !pause || !scrubber || !time) return;
    video.dataset.manimPlayerWired = "true";

    function updateTime() {
      var duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        scrubber.disabled = true;
        scrubber.style.setProperty("--manim-progress", "0%");
        time.textContent = "0:00 / 0:00";
        return;
      }

      var current = Math.min(Math.max(video.currentTime || 0, 0), duration);
      scrubber.disabled = false;
      scrubber.max = duration;
      scrubber.value = current;
      scrubber.style.setProperty("--manim-progress", (current / duration) * 100 + "%");
      time.textContent = formatManimTime(current) + " / " + formatManimTime(duration);
    }

    function updatePlayingState() {
      player.classList.toggle("is-playing", !video.paused && !video.ended);
    }

    [play, stop, pause].forEach(function (button) { button.disabled = false; });
    play.addEventListener("click", function () {
      delete video.dataset.manimUserPaused;
      video.play().catch(function () {});
    });
    pause.addEventListener("click", function () {
      video.dataset.manimUserPaused = "true";
      video.pause();
    });
    stop.addEventListener("click", function () {
      video.dataset.manimUserPaused = "true";
      video.pause();
      video.currentTime = 0;
    });
    scrubber.addEventListener("input", function () {
      if (Number.isFinite(video.duration)) video.currentTime = Number(scrubber.value);
    });
    ["loadedmetadata", "durationchange", "timeupdate", "seeking", "seeked"].forEach(function (eventName) {
      video.addEventListener(eventName, updateTime);
    });
    ["play", "pause", "ended"].forEach(function (eventName) {
      video.addEventListener(eventName, updatePlayingState);
    });
    updateTime();
    updatePlayingState();
  }

  function wireManimVideos() {
    if (manimObserver) manimObserver.disconnect();
    var videos = Array.prototype.slice.call(contentEl.querySelectorAll("video.manim-video"));
    if (!videos.length) return;

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    videos.forEach(function (video) {
      video.muted = true;
      video.playsInline = true;
      wireManimPlayerControls(video);
      if (reduce) video.pause();
    });
    if (reduce || !("IntersectionObserver" in window)) {
      if (!reduce) videos.forEach(function (video) { video.play().catch(function () {}); });
      return;
    }

    manimObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting && video.dataset.manimUserPaused !== "true") video.play().catch(function () {});
        else if (!entry.isIntersecting) video.pause();
      });
    }, { threshold: 0.15 });
    videos.forEach(function (video) { manimObserver.observe(video); });
  }
  wireManimVideos();

  var registry = {}; /* id -> the parts an app answers for itself */
  var listeners = {}; /* event name -> handlers */

  function windowState(w) {
    if (w.classList.contains("closed")) return "closed";
    if (w.classList.contains("minimized")) return "minimized";
    return "open";
  }

  function app(id) {
    var custom = registry[id];
    var w = winById(id);
    var btn = btnFor(id);
    if (!custom && !w && !btn) return null;

    function state() {
      if (custom && custom.state) return custom.state();
      if (w) return windowState(w);
      /* Webamp draws its own window, so its taskbar button is the only
         honest signal left. */
      return btn && !btn.hidden ? "open" : "closed";
    }

    return {
      id: id,
      state: state,
      open: function () { return state() === "open"; },
      front: function () {
        return state() === "open" && !!btn && btn.classList.contains("active");
      },
      title: function () {
        if (custom && custom.title) return custom.title();
        var t = w && w.querySelector(".title-bar-text");
        if (t) return t.textContent.trim();
        var label = btn && btn.querySelector(".taskbar-task-label");
        return label ? label.textContent.trim() : id;
      },
      content: function () {
        return custom && custom.content ? custom.content() : null;
      },
    };
  }

  function apps() {
    var ids = {};
    windows.forEach(function (w) { ids[w.dataset.win] = true; });
    taskBtns.forEach(function (b) { ids[b.dataset.for] = true; });
    Object.keys(registry).forEach(function (id) { ids[id] = true; });
    return Object.keys(ids).map(app).filter(Boolean);
  }

  function on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
    if (name === "app") watchApps();
  }

  function emit(name, detail) {
    (listeners[name] || []).forEach(function (fn) {
      /* A listener that throws is the listener's problem; the desktop
         carries on. */
      try { fn(detail); } catch (e) { /* nothing sensible to do */ }
    });
  }

  /* An app whose insides changed without its window changing - a script
     that finished running, a search that came back empty - says so. */
  function notify(id) {
    var a = app(id);
    if (a) emit("app", { id: id, state: a.state() });
  }

  var watching = false;
  var obs = null;
  var lastState = {};

  function watchWindow(w) {
    if (obs) obs.observe(w, { attributes: true, attributeFilter: ["class"] });
  }
  function watchTask(b) {
    if (obs) obs.observe(b, { attributes: true, attributeFilter: ["hidden"] });
  }

  function watchApps() {
    if (watching || !window.MutationObserver) return;
    watching = true;
    /* Every open, close and minimize on this desktop is a class on a
       window or a hidden taskbar button, whoever set it - here,
       winamp.js, find.js, editor.js. Watching the furniture beats
       asking a dozen call sites to remember to announce themselves. */
    apps().forEach(function (a) { lastState[a.id] = a.state(); });
    obs = new MutationObserver(function () {
      apps().forEach(function (a) {
        var now = a.state();
        if (now === lastState[a.id]) return;
        lastState[a.id] = now;
        emit("app", { id: a.id, state: now });
      });
    });
    windows.forEach(watchWindow);
    taskBtns.forEach(watchTask);
  }

  /* --- The main window's content is the page itself --- */
  /* What the document *is* never changes, so it's surveyed once. Where
     the reader has got to in it, and what they have highlighted, is
     answered fresh every time - that's the whole point of asking. */

  var survey = null;
  function surveyed() {
    if (survey) return survey;
    var article = contentEl && contentEl.querySelector("article");
    var meta = article && article.querySelector(".post-meta");
    var heading = contentEl && contentEl.querySelector("h1");
    var prose = article ? article.textContent : contentEl ? contentEl.textContent : "";
    survey = {
      /* A post is a page with a date on it; a folder is one with a list
         of them. Both are read off the markup rather than the URL,
         which is a guess about a routing table. */
      kind: meta
        ? "post"
        : contentEl && contentEl.querySelector(".post-list a, .post-table a")
          ? "index"
          : "page",
      title: heading ? heading.textContent.trim() : document.title,
      minutes: meta ? Number((meta.textContent.match(/(\d+)\s*min/) || [])[1]) || 0 : 0,
      code: article ? article.querySelectorAll("pre").length : 0,
      python: pyBlocks.length ? pyBlocks[0].textContent.replace(/\n$/, "") : null,
      math: !!(contentEl && contentEl.querySelector("math")),
      comments: !!(contentEl && contentEl.querySelector(".comments")),
      feed: !!document.querySelector('link[rel="alternate"]'),
      /* What the page is about, to the extent a regex can tell. */
      topic: /\b(machine learning|neural net|gradient|embedding|regression|classifier|transformer)/i.test(prose)
        ? "machine learning"
        : null,
    };
    return survey;
  }

  /* The window body scrolls, not the page - except on phones, where it
     can be either, so ask whichever is actually moving. */
  function scroller() {
    if (contentEl && contentEl.scrollHeight - contentEl.clientHeight > 4) return contentEl;
    return document.scrollingElement || document.documentElement;
  }

  function progress() {
    var s = scroller();
    var max = s.scrollHeight - s.clientHeight;
    /* null, not 1: a page that doesn't scroll hasn't been read to the
       end, it just fits. */
    if (max <= 4) return null;
    return Math.min(1, Math.max(0, s.scrollTop / max));
  }

  function selectedText() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode) return "";
    if (!contentEl || !contentEl.contains(sel.anchorNode)) return "";
    return String(sel).replace(/\s+/g, " ").trim();
  }

  registry.main = {
    content: function () {
      var s = surveyed();
      return {
        kind: s.kind,
        title: s.title,
        minutes: s.minutes,
        code: s.code,
        python: s.python,
        math: s.math,
        comments: s.comments,
        feed: s.feed,
        topic: s.topic,
        progress: progress(),
        selection: selectedText(),
      };
    },
  };

  /* --- Opening pages, without rebooting the desktop --- */
  /* A post is a document you open, not a machine you restart. A normal
     link would throw away everything running here - Winamp mid-track, a
     dialled-up Internet, a Python session with your variables still in
     it - to change what one window shows. So links are followed the way
     Explorer opened a folder: fetch the document, repaint the window
     that owns it, and leave the rest of the desktop exactly as it was.

     Everything is a fallback away from a plain navigation: the markup is
     ordinary <a href>, and no fetch, no History API, an unroutable URL,
     a failed request or any surprise in the response hands the click
     straight back to the browser. */

  var mainWindow = document.querySelector(".main-window");
  var windowStack = document.querySelector(".window-stack");

  var canRoute = !!(
    window.fetch &&
    window.DOMParser &&
    window.history &&
    history.pushState &&
    mainWindow &&
    windowStack &&
    contentEl
  );

  /* Zola's page URLs are either extensionless (get_url) or end in a
     slash (permalinks); anything carrying a file extension is a file,
     not a window - the feed, the manifest, the scripts, every image. */
  function routable(url) {
    if (!canRoute) return null;
    var a = document.createElement("a");
    a.href = url;
    if (a.protocol !== location.protocol || a.host !== location.host) return null;
    var last = a.pathname.split("/").pop();
    if (last && last.indexOf(".") !== -1 && !/\.html?$/.test(last)) return null;
    return a;
  }

  /* Pages are immutable between deploys, so one fetch per URL is
     plenty - Back and Forward come out of here for free. The HTML is
     kept as text, not as a parsed document: a string costs a fraction
     of the memory, and parsing it again is a millisecond. */
  var pageCache = {};

  function fetchPage(url) {
    if (pageCache[url]) return pageCache[url];
    var p = fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        var type = r.headers.get("content-type") || "";
        /* A 404 has its own window to show and a status code worth
           keeping; let the browser navigate to it properly. */
        if (!r.ok || type.indexOf("text/html") === -1) throw new Error("not a page");
        /* Where we actually ended up: a host that redirects /about to
           the canonical /about/ must be believed, because the address
           bar - and giscus and the view counter, which key off the
           path - all have to agree on one URL per page. */
        var landed = r.url || url;
        return r.text().then(function (html) {
          return { url: landed, html: html };
        });
      });
    /* A failure is this minute's problem, not this session's. */
    p.catch(function () { delete pageCache[url]; });
    pageCache[url] = p;
    return p;
  }

  /* innerHTML parses <script> but never runs it; the page's own inline
     scripts (the view counter, giscus) have to be re-created to fire. */
  function runScripts(root) {
    Array.prototype.slice.call(root.querySelectorAll("script")).forEach(function (old) {
      var s = document.createElement("script");
      Array.prototype.slice.call(old.attributes).forEach(function (at) {
        s.setAttribute(at.name, at.value);
      });
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function copyClass(from, to) {
    if (from && to) to.className = from.className;
  }

  function copyText(from, to) {
    if (from && to) to.textContent = from.textContent;
  }

  function swap(doc) {
    var fresh = doc.querySelector('main[data-win="main"]');
    var freshBody = fresh && fresh.querySelector("#content");
    if (!freshBody) throw new Error("no main window in the response");

    /* Head: the title bar of the browser we're pretending not to be, and
       the tags a share sheet reads. */
    document.title = doc.title;
    [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:type"]',
      'meta[property="og:url"]',
    ].forEach(function (sel) {
      var from = doc.head.querySelector(sel);
      var to = document.head.querySelector(sel);
      if (from && to) to.setAttribute("content", from.getAttribute("content"));
    });

    /* The main window keeps its identity - and with it everything the
       reader has done to it: where they dragged it, how they sized it,
       whether it's maximized. Only its contents change. */
    copyClass(fresh.querySelector(".title-bar-icon"), mainWindow.querySelector(".title-bar-icon"));
    copyText(fresh.querySelector(".title-bar-text"), mainWindow.querySelector(".title-bar-text"));
    contentEl.innerHTML = freshBody.innerHTML;
    var statusBar = mainWindow.querySelector(".status-bar");
    var freshStatus = fresh.querySelector(".status-bar");
    if (statusBar && freshStatus) statusBar.innerHTML = freshStatus.innerHTML;

    /* Background windows (the blog folder behind a post) belong to the
       page, so they arrive and leave with it. */
    Array.prototype.slice.call(windowStack.querySelectorAll(".background-window")).forEach(
      function (w) {
        var b = btnFor(w.dataset.win);
        if (b) dropTask(b);
        dropWindow(w);
      }
    );
    var after = mainWindow;
    Array.prototype.slice.call(doc.querySelectorAll(".background-window")).forEach(function (w) {
      var node = document.importNode(w, true);
      after.parentNode.insertBefore(node, after.nextSibling);
      after = node;
      adoptWindow(node);
      /* Its taskbar button sits ahead of the main window's, the way the
         templates order them. The lazy apps' buttons are never touched:
         they hold live state this page knows nothing about. */
      var freshBtn = doc.querySelector('.taskbar-task[data-for="' + node.dataset.win + '"]');
      var mainBtn = btnFor("main");
      if (!freshBtn || !mainBtn) return;
      var btn = document.importNode(freshBtn, true);
      mainBtn.parentNode.insertBefore(btn, mainBtn);
      adoptTask(btn);
    });

    var task = btnFor("main");
    var freshTask = doc.querySelector('.taskbar-task[data-for="main"]');
    if (task && freshTask) {
      copyClass(freshTask.querySelector(".icon"), task.querySelector(".icon"));
      copyText(freshTask.querySelector(".taskbar-task-label"), task.querySelector(".taskbar-task-label"));
      task.hidden = false;
    }

    /* The Start menu marks where you are, and the fresh document has
       already worked that out server-side. */
    var freshItems = doc.querySelectorAll(".start-menu a[role=menuitem]");
    var items = startMenu.querySelectorAll("a[role=menuitem]");
    if (freshItems.length === items.length) {
      for (var i = 0; i < items.length; i++) {
        if (freshItems[i].hasAttribute("aria-current")) items[i].setAttribute("aria-current", "page");
        else items[i].removeAttribute("aria-current");
      }
    }

    /* Opening a file reopens its window, closed or minimized or not. */
    mainWindow.classList.remove("closed", "minimized");
    activate("main");

    runScripts(contentEl);
    if (statusBar) runScripts(statusBar);
    findPyBlocks();
    wireTryMe();
    wireManimVideos();

    /* What the main window holds is a different document now; the survey
       was cached against the old one. */
    survey = null;
    notify("main");
  }

  var navSeq = 0;
  var shownPath = location.pathname + location.search;

  function setNavigating(on) {
    document.body.classList.toggle("navigating", on);
  }

  function restoreScroll(target, top) {
    var anchor = null;
    if (target.hash.length > 1) {
      try {
        anchor = contentEl.querySelector(target.hash);
      } catch (e) { /* not a selector - not our problem */ }
    }
    if (anchor && anchor.scrollIntoView) {
      anchor.scrollIntoView();
      return;
    }
    contentEl.scrollTop = top || 0;
    var page = document.scrollingElement || document.documentElement;
    if (page) page.scrollTop = top || 0;
  }

  function go(url, push, top) {
    var target = routable(url);
    if (!target) {
      location.href = url;
      return;
    }

    /* Whatever was on top of the desktop belongs to the click that just
       happened, not to the page arriving. */
    setStartMenu(false);
    closeDeskMenu(false);
    deselectIcons();
    setNavigating(true);

    var seq = ++navSeq;
    fetchPage(target.href.split("#")[0]).then(
      function (page) {
        if (seq !== navSeq) return; /* a later click won the race */
        setNavigating(false);
        try {
          if (push) {
            /* Remember how far down the reader got, so Back puts them
               back there instead of at the top. */
            history.replaceState({ mfTop: contentEl.scrollTop }, "");
            history.pushState({ mfTop: 0 }, "", page.url + target.hash);
          }
          swap(new DOMParser().parseFromString(page.html, "text/html"));
        } catch (err) {
          location.href = target.href;
          return;
        }
        shownPath = location.pathname + location.search;
        restoreScroll(target, top);
        /* Screen readers and keyboards land in the new document rather
           than wherever the old one left them. */
        try {
          contentEl.focus({ preventScroll: true });
        } catch (err2) {
          contentEl.focus();
        }
      },
      function () {
        /* Offline, a 404, a redirect to somewhere else entirely: the
           browser does all of that better than we can. */
        if (seq !== navSeq) return;
        setNavigating(false);
        location.href = target.href;
      }
    );
  }

  if (canRoute) {
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest("a[href]");
      if (!a || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      var target = routable(a.href);
      if (!target) return;
      /* A jump inside the page we're already on is the browser's job. */
      if (
        target.hash &&
        target.pathname === location.pathname &&
        target.search === location.search
      ) {
        return;
      }
      e.preventDefault();
      go(a.href, true);
    });

    window.addEventListener("popstate", function (e) {
      /* The Internet's iframe shares this session history, and a hash
         link moves through it too; neither changes which page the main
         window is showing. */
      if (location.pathname + location.search === shownPath) return;
      go(location.href, false, e.state && e.state.mfTop);
    });

    /* The entry we started on gets a state object too, so coming Back to
       it restores the scroll position like any other. */
    try {
      history.replaceState({ mfTop: 0 }, "");
    } catch (e) { /* file:// and friends */ }
  }

  /* --- Python editor (lazy-loaded) --- */
  /* The editor's code (syntax highlighting, virtual FS, Pyodide glue)
     lives in editor.js and is only fetched the first time it's opened. */
  window.MF = {
    activate: activate,
    activateTopmost: activateTopmost,
    btnFor: btnFor,
    loadScript: loadScript,
    winampError: function (message) { winampError(message); },
    /* The app registry above: who's running, and what's in them. */
    app: app,
    apps: apps,
    register: function (id, api) {
      registry[id] = api || {};
      notify(id);
    },
    notify: notify,
    on: on,
    /* Bridge for the lazy apps (clippy.js) - settings live here, and
       the launchers are function declarations, so hoisting makes them
       safe to reference from this earlier assignment. */
    getSetting: function (key) { return settings[key]; },
    setSetting: function (key, value) {
      settings[key] = value;
      saveSettings();
    },
    openPyEditor: function (code) { openPyEditor(code || null); },
    openBrowser: function () { openBrowser(); },
    openWinamp: function () { openWinamp(); },
    openFind: function (query) { openFind(query); },
    startScreensaver: function () { startScreensaver(saverMode(true)); },
    /* Open a page of this site in the main window, without reloading the
       desktop (see "Opening pages" below). */
    open: function (url) { go(url, true); },
  };

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

  /* --- Winamp (lazy-loaded, doubly so) --- */
  /* winamp.js is a small launcher fetched on first open; it in turn
     pulls in the ~900 KB Webamp bundle. Neither costs page load
     anything, and the bundle is excluded from the service worker
     precache (scripts/fingerprint.mjs) so it's only ever downloaded
     when someone actually whips the llama. */
  var winampPromise = null;
  function openWinamp() {
    if (window.MFWinamp) {
      window.MFWinamp.open();
      return;
    }
    if (!winampPromise) {
      winampPromise = loadScript(WINAMP_SRC, function () { return window.MFWinamp; })
        .catch(function (err) {
          winampPromise = null; // allow retry
          throw err;
        });
    }
    winampPromise.then(
      function (winamp) { winamp.open(); },
      function () {
        winampError("Winamp could not be loaded \u2014 check your connection and try again.");
      }
    );
  }

  document.getElementById("menu-winamp").addEventListener("click", function () {
    setStartMenu(false);
    openWinamp();
  });

  /* --- Find: Files or Folders (lazy-loaded) --- */
  /* The chrome ships in the page; find.js adds the behaviour, and only
     reaches for the full-text index if someone searches inside files. */
  var findPromise = null;
  function openFind(query) {
    if (window.MFFind) {
      window.MFFind.open(query);
      return;
    }
    if (!findPromise) {
      findPromise = loadScript(FIND_SRC, function () { return window.MFFind; })
        .catch(function (err) {
          findPromise = null; // allow retry
          throw err;
        });
    }
    findPromise.then(
      function (find) { find.open(query); },
      function () {
        var status = document.getElementById("find-status");
        if (status) status.textContent = "Failed to load Find \u2014 check your connection";
        var w = winById("find");
        if (w) {
          w.classList.remove("closed", "minimized");
          var b = btnFor("find");
          if (b) b.hidden = false;
          activate("find");
        }
      }
    );
  }

  document.getElementById("menu-find").addEventListener("click", function () {
    setStartMenu(false);
    openFind(null);
  });

  /* F3 opened Find on a Win98 desktop, and Ctrl+F did it from any
     Explorer window; both are muscle memory for "search this thing".
     Typing in a field always wins - the Python editor and the Find
     window's own boxes keep the browser's native shortcuts. */
  document.addEventListener("keydown", function (e) {
    var wanted = e.key === "F3" || ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F"));
    if (!wanted || e.altKey) return;
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    e.preventDefault();
    setStartMenu(false);
    openFind(null);
  });

  /* Winamp launch failure dialog: shown from here (winamp.js failed to
     load) or from winamp.js (Webamp bundle failed); shared via MF. */
  var winampDialog = document.getElementById("winamp-dialog");

  function winampError(message) {
    document.getElementById("winamp-dialog-msg").textContent =
      message || "Winamp could not be loaded \u2014 check your connection and try again.";
    openPopup(winampDialog, document.getElementById("winamp-dialog-ok"));
  }

  ["winamp-dialog-close", "winamp-dialog-ok"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      closePopup(winampDialog);
    });
  });
  winampDialog.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePopup(winampDialog);
  });

  /* "Try me" buttons on Python code blocks */
  function wireTryMe() {
    pyBlocks.forEach(function (code) {
      var pre = code.parentElement;
      if (!pre || pre.parentElement.classList.contains("tryme-wrap")) return;
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
  }
  wireTryMe();

  /* --- Screen saver (lazy-loaded) --- */
  /* The canvas savers live in screensaver.js and are only fetched when
     the machine has actually been idle long enough to need one, so the
     feature costs nothing to anyone who keeps reading. */
  var SAVER_DEFAULT = "starfield";
  var SAVER_WAIT_DEFAULT = 5; /* minutes */
  var saverPromise = null;
  var saverBroken = false; /* failed to load: stop retrying this page view */
  var idleTimer = null;
  var lastIdleReset = 0;

  function saverMode(coerce) {
    var mode = typeof settings.screensaver === "string" ? settings.screensaver : SAVER_DEFAULT;
    /* coerce: a caller that wants a saver *now* (Preview, the Assistant)
       shouldn't be defeated by the user's "(None)" preference. */
    return coerce && mode === "none" ? SAVER_DEFAULT : mode;
  }

  function saverWait() {
    var n = Number(settings.screensaverWait);
    if (!isFinite(n) || n < 1) n = SAVER_WAIT_DEFAULT;
    return Math.min(Math.round(n), 60);
  }

  function saverRunning() {
    return !!(window.MFScreensaver && window.MFScreensaver.running());
  }

  function startScreensaver(name) {
    if (saverBroken || saverRunning()) return;
    if (document.body.classList.contains("shut-down")) return;
    var mode = name || saverMode(false);
    if (mode === "none") return;
    if (window.MFScreensaver) {
      window.MFScreensaver.start(mode, { onstop: resetIdle });
      return;
    }
    if (!saverPromise) {
      saverPromise = loadScript(SCREENSAVER_SRC, function () { return window.MFScreensaver; })
        .catch(function (err) {
          saverPromise = null; // allow retry
          throw err;
        });
    }
    saverPromise.then(
      function (saver) { saver.start(mode, { onstop: resetIdle }); },
      function () { saverBroken = true; }
    );
  }

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (saverMode(false) === "none" || saverBroken) return;
    idleTimer = setTimeout(function () { startScreensaver(null); }, saverWait() * 60000);
  }

  function resetIdle() {
    /* mousemove fires in floods; rescheduling a timer per event is
       wasteful, and one second of granularity on a five-minute timer is
       not a distinction anyone can perceive. */
    var now = Date.now();
    if (now - lastIdleReset < 1000) return;
    lastIdleReset = now;
    if (saverRunning()) return; /* its own onstop will reschedule */
    scheduleIdle();
  }

  ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, resetIdle, { passive: true, capture: true });
  });
  scheduleIdle();

  /* --- Office Assistant (lazy-loaded) --- */
  /* Summon-only, like every other app here: clippy.js is never fetched
     until someone asks for the Assistant from Start > Help or turns it
     on in the Control Panel. The setting persists, so for anyone who
     opted in it comes back on later pages - but even then the fetch is
     deferred to idle time so it never competes with the page itself. */
  var clippyPromise = null;

  function assistantOn() {
    return settings.assistant === true;
  }

  function loadClippy() {
    if (window.MFClippy) return Promise.resolve(window.MFClippy);
    if (!clippyPromise) {
      clippyPromise = loadScript(CLIPPY_SRC, function () { return window.MFClippy; })
        .catch(function (err) {
          clippyPromise = null; // allow retry
          throw err;
        });
    }
    return clippyPromise;
  }

  function openAssistant(greet) {
    loadClippy().then(
      function (clippy) { clippy.show({ greet: !!greet }); },
      function () { /* no assistant is no tragedy */ }
    );
  }

  function applyAssistant() {
    if (assistantOn()) openAssistant(false);
    else if (window.MFClippy) window.MFClippy.hide();
  }

  document.getElementById("menu-help").addEventListener("click", function () {
    setStartMenu(false);
    /* Asking for Help is consent: always greet, even if it was hidden. */
    settings.assistant = true;
    saveSettings();
    openAssistant(true);
  });

  /* Opted in on a previous visit: bring it back, but only once the
     browser has nothing better to do. */
  if (assistantOn()) {
    if (window.requestIdleCallback) {
      requestIdleCallback(function () { openAssistant(false); }, { timeout: 4000 });
    } else {
      window.addEventListener("load", function () { openAssistant(false); });
    }
  }

  /* --- Shut Down... --- */
  document.getElementById("menu-shutdown").addEventListener("click", function () {
    setStartMenu(false);
    shutdown.hidden = false;
    document.body.classList.add("shut-down");
    shutdown.focus();
  });

  function turnBackOn() {
    shutdown.hidden = true;
    document.body.classList.remove("shut-down");
    startBtn.focus();
  }

  shutdown.addEventListener("click", turnBackOn);
  shutdown.addEventListener("keydown", function (e) {
    /* any key wakes the machine, like the good old days */
    e.preventDefault();
    turnBackOn();
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
      closePopup(dialog);
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

    openPopup(dialog, document.getElementById("update-yes"));
  }
})();

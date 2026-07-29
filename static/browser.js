/* "The Internet" - lazy-loaded by main.js when the browser is
   opened. Plays a synthesized dial-up modem handshake over a Win98
   dialing dialog, then browses the web of 1998 via the Internet
   Archive's Wayback Machine in a sandboxed iframe.

   The modem sound is generated with WebAudio (dial tone, DTMF digits,
   answer tone, carrier negotiation chirps, V.90-ish training hiss), so
   no audio asset ships and there's nothing to license. */

(function () {
  var win = document.querySelector('[data-win="browser"]');
  var body = win.querySelector(".browser-body");
  var dialup = document.getElementById("dialup");
  var statusEl = document.getElementById("dialup-status");
  var barEl = document.getElementById("browser-status");
  var titleEl = document.getElementById("browser-title");
  var cancelBtn = document.getElementById("dialup-cancel");

  var addressEl = document.getElementById("browser-address");
  var backBtn = document.getElementById("browser-back");
  var fwdBtn = document.getElementById("browser-fwd");
  var stopBtn = document.getElementById("browser-stop");
  var refreshBtn = document.getElementById("browser-refresh");
  var homeBtn = document.getElementById("browser-home");
  var searchBtn = document.getElementById("browser-search");
  var favBtn = document.getElementById("browser-favorites");
  var goBtn = document.getElementById("browser-go");
  var toolbarControls = [
    addressEl, backBtn, fwdBtn, stopBtn, refreshBtn, homeBtn, searchBtn, favBtn, goBtn,
  ];

  /* It's always 1998 in here. Home is Slashdot: "News for Nerds.
     Stuff that matters." - THE programmer hangout of 1998. Search is
     AltaVista, back when it lived on a DEC hostname. */
  var YEAR = "1998";
  var HOME = "slashdot.org";
  var SEARCH = "altavista.digital.com";
  var WAYBACK = "https://web.archive.org/web/" + YEAR + "if_/";

  var ctx = null;
  var master = null;
  var timers = [];
  var connected = false;
  var dialing = false;
  var frame = null;
  var loads = 0; /* iframe navigations (incl. link clicks inside) */

  /* --- Modem sound synthesis --- */

  function tones(t0, dur, freqs, gain, type) {
    freqs.forEach(function (f) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain / freqs.length, t0 + 0.01);
      g.gain.setValueAtTime(gain / freqs.length, t0 + dur - 0.01);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur);
    });
  }

  function hiss(t0, dur, gain, rampIn) {
    var len = Math.ceil(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + (rampIn || 0.05));
    g.gain.setValueAtTime(gain, t0 + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  var DTMF = {
    1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
    4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
    0: [941, 1336],
  };

  /* Schedules the whole handshake; returns a timeline of status-text
     offsets in seconds. */
  function playModem() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    var t = ctx.currentTime + 0.05;
    var start = t;

    /* dial tone */
    tones(t, 0.7, [350, 440], 0.9);
    t += 0.8;

    /* DTMF: 555-1998 */
    "5551998".split("").forEach(function (d) {
      tones(t, 0.09, DTMF[d], 1);
      t += 0.16;
    });
    t += 0.3;

    /* one ring */
    tones(t, 1.0, [440, 480], 0.7);
    t += 1.5;

    var answered = t - start;

    /* answer tone + carrier negotiation chirps */
    tones(t, 0.7, [2100], 0.8);
    t += 0.8;
    tones(t, 0.45, [1650], 0.7, "square");
    tones(t + 0.45, 0.45, [1850], 0.7, "square");
    t += 1.0;
    tones(t, 0.35, [980, 1180], 0.8);
    tones(t + 0.4, 0.35, [1300, 2100], 0.8);
    t += 0.9;

    var training = t - start;

    /* V.90 training hiss, fading out into "connected" */
    hiss(t, 2.2, 0.8, 0.3);
    t += 2.2;

    return { verifying: answered, speed: training, done: t - start };
  }

  function stopSound() {
    timers.forEach(clearTimeout);
    timers = [];
    if (ctx) {
      ctx.close().catch(function () {});
      ctx = null;
      master = null;
    }
  }

  /* --- Dialing sequence --- */

  function soundEnabled() {
    try {
      var s = JSON.parse(localStorage.getItem("mf-settings")) || {};
      return s.modemSound !== false;
    } catch (e) {
      return true;
    }
  }

  function at(sec, fn) {
    timers.push(setTimeout(fn, sec * 1000));
  }

  function setStatus(text) {
    statusEl.textContent = text;
    barEl.textContent = text;
  }

  function connect() {
    dialing = true;
    dialup.hidden = false;
    var tl;
    if (soundEnabled()) {
      try {
        tl = playModem();
      } catch (err) {
        /* no WebAudio? Skip the theater, browse anyway */
        finish();
        return;
      }
    } else {
      /* Sound off (Control Panel): quick, silent dial */
      tl = { verifying: 0.5, speed: 1.0, done: 1.5 };
    }
    setStatus("Dialing 555-1998...");
    at(tl.verifying, function () {
      setStatus("Verifying user name and password...");
    });
    at(tl.speed, function () {
      setStatus("Connecting at 56,000 bps...");
    });
    at(tl.done, finish);
  }

  function finish() {
    stopSound();
    dialing = false;
    connected = true;
    setStatus("Connected!");
    dialup.hidden = true;

    frame = document.createElement("iframe");
    frame.className = "browser-frame";
    frame.title = "The web of 1998, via the Internet Archive";
    frame.setAttribute(
      "sandbox",
      /* No allow-scripts: the Wayback Machine injects its navigation
         banner with JS, so blocking scripts keeps archived pages
         banner-free even when links lose the if_ (iframe) flag. The
         web of 1998 is static HTML anyway - and its popup ads and
         <blink> scripts can stay buried. No allow-popups either. */
      "allow-same-origin allow-forms"
    );
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.addEventListener("load", function () {
      loads++;
      /* Back also covers link clicks inside the page: cross-origin
         iframe navigations still land in the session history, so
         history.back() steps the iframe, not the whole page. */
      if (loads >= 2) backBtn.disabled = false;
      setLoading(false);
      barEl.textContent = "Done";
    });
    body.appendChild(frame);

    toolbarControls.forEach(function (el) { el.disabled = false; });
    backBtn.disabled = true;
    fwdBtn.disabled = true;

    navigate(HOME);
  }

  /* --- Navigation (always via the Wayback Machine, year 1998) --- */

  function normalize(input) {
    var url = (input || "").trim();
    if (!url) return null;
    url = url.replace(/^about:/, "");
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    return url;
  }

  var doneTimer = null;

  function setLoading(on) {
    win.classList.toggle("loading", on);
  }

  function navigate(input) {
    var url = normalize(input);
    if (!url) return;
    var display = url.replace(/^https?:\/\//i, "");
    addressEl.value = display;
    titleEl.textContent = display + " - The Internet";
    barEl.textContent = "Opening page " + url + "...";
    setLoading(true);
    frame.src = WAYBACK + url;
    fwdBtn.disabled = true;
    /* 1998 pages love resources that never finish loading; don't let
       a hung ad banner keep the status bar spinning forever */
    clearTimeout(doneTimer);
    doneTimer = setTimeout(function () {
      setLoading(false);
      if (barEl.textContent.indexOf("Opening") === 0) barEl.textContent = "Done";
    }, 12000);
  }

  goBtn.addEventListener("click", function () {
    navigate(addressEl.value);
  });
  addressEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") navigate(addressEl.value);
  });
  homeBtn.addEventListener("click", function () {
    navigate(HOME);
  });
  searchBtn.addEventListener("click", function () {
    navigate(SEARCH);
  });
  stopBtn.addEventListener("click", function () {
    /* The iframe is cross-origin, so we can't truly halt it - but we
       can stop pretending to wait. Authentic enough for 56k. */
    clearTimeout(doneTimer);
    setLoading(false);
    barEl.textContent = "Done";
  });
  refreshBtn.addEventListener("click", function () {
    if (frame && frame.src) {
      barEl.textContent = "Refreshing...";
      setLoading(true);
      frame.src = frame.src; /* eslint-disable-line no-self-assign */
    }
  });
  backBtn.addEventListener("click", function () {
    if (loads > 1) {
      history.back();
      fwdBtn.disabled = false;
    }
  });
  fwdBtn.addEventListener("click", function () {
    history.forward();
  });

  /* --- Favorites (presets + user's own, saved to localStorage) --- */

  var favMenu = document.getElementById("favorites-menu");
  var favAdd = document.getElementById("fav-add");
  var favList = document.getElementById("fav-list");

  /* The bookmarks of a 1998 programmer: open source news, language
     homes, web-dev schools - and Annica Tigers HTML-skola, where half
     of Sweden learned HTML. (tiger.se's oldest capture is Oct 2000;
     the Wayback Machine resolves to the nearest snapshot.) */
  var PRESETS = [
    ["Annica Tigers HTML-skola", "tiger.se"],
    ["Freshmeat", "freshmeat.net"],
    ["Webmonkey", "hotwired.com/webmonkey"],
    ["W3C", "w3.org"],
    ["PHP", "php.net"],
    ["Perl", "perl.com"],
    ["GNU Project", "gnu.org"],
    ["Linux Online", "linux.org"],
    ["Java (Sun)", "java.sun.com"],
    ["DejaNews", "dejanews.com"],
    ["Dr. Dobb's Journal", "ddj.com"],
    ["GeoCities", "geocities.com"],
  ];

  function loadFavs() {
    try {
      return JSON.parse(localStorage.getItem("mf-favorites")) || [];
    } catch (e) {
      return [];
    }
  }

  function saveFavs(favs) {
    try {
      localStorage.setItem("mf-favorites", JSON.stringify(favs));
    } catch (e) {
      /* private browsing etc. - favorites just won't persist */
    }
  }

  function favItem(name, url, removable) {
    var b = document.createElement("button");
    b.className = "fav-item";
    b.type = "button";
    b.setAttribute("role", "menuitem");
    var ic = document.createElement("span");
    ic.className = "icon icon-ie-16";
    ic.setAttribute("aria-hidden", "true");
    b.appendChild(ic);
    b.appendChild(document.createTextNode(" " + name));
    b.addEventListener("click", function () {
      toggleFavMenu(false);
      navigate(url);
    });
    if (!removable) return b;
    var row = document.createElement("div");
    row.className = "fav-row";
    row.appendChild(b);
    var x = document.createElement("button");
    x.className = "fav-remove";
    x.type = "button";
    x.textContent = "\u00d7";
    x.setAttribute("aria-label", "Remove " + name + " from Favorites");
    x.addEventListener("click", function () {
      saveFavs(loadFavs().filter(function (f) { return f.url !== url; }));
      renderFavs();
    });
    row.appendChild(x);
    return row;
  }

  function renderFavs() {
    favList.textContent = "";
    PRESETS.forEach(function (p) {
      favList.appendChild(favItem(p[0], p[1], false));
    });
    var user = loadFavs();
    if (user.length) {
      var sep = document.createElement("div");
      sep.className = "fav-sep";
      favList.appendChild(sep);
      user.forEach(function (f) {
        favList.appendChild(favItem(f.name, f.url, true));
      });
    }
  }

  function toggleFavMenu(show) {
    var vis = typeof show === "boolean" ? show : favMenu.hidden;
    if (vis) {
      renderFavs();
      /* drop the menu under the Favorites button */
      favMenu.style.left = Math.max(2, favBtn.offsetLeft) + "px";
    }
    favMenu.hidden = !vis;
    favBtn.setAttribute("aria-expanded", String(vis));
  }

  favBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleFavMenu();
  });

  favAdd.addEventListener("click", function () {
    toggleFavMenu(false);
    var url = (addressEl.value || "").trim();
    if (!url) return;
    var taken = PRESETS.some(function (p) { return p[1] === url; }) ||
      loadFavs().some(function (f) { return f.url === url; });
    if (taken) return;
    var favs = loadFavs();
    favs.push({ name: url, url: url });
    saveFavs(favs);
  });

  document.addEventListener("click", function (e) {
    if (!favMenu.hidden && !favMenu.contains(e.target)) toggleFavMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !favMenu.hidden) {
      toggleFavMenu(false);
      favBtn.focus();
    }
  });

  /* --- Window lifecycle --- */

  function closeWindow() {
    win.classList.add("closed");
    var b = window.MF.btnFor("browser");
    if (b) b.hidden = true;
  }

  function hangUp() {
    stopSound();
    dialing = false;
    setStatus("Disconnected.");
    closeWindow();
  }

  cancelBtn.addEventListener("click", hangUp);

  /* Hanging up when the window is closed mid-dial feels right; an
     established connection survives close (the iframe keeps its state
     while the window is display:none, like a minimized session). */
  win.querySelector('[aria-label="Close"]').addEventListener("click", function () {
    if (dialing) hangUp();
  });

  function open() {
    win.classList.remove("closed");
    win.classList.remove("minimized");
    var b = window.MF.btnFor("browser");
    if (b) b.hidden = false;
    window.MF.activate("browser");
    if (!connected && !dialing) connect();
  }

  window.MFBrowser = { open: open };
})();

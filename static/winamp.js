/* Winamp - lazy-loaded by main.js when Winamp is first opened. A thin
   launcher around Webamp (https://github.com/captbaritone/webamp), the
   faithful browser reimplementation of Winamp 2.9. The Webamp bundle
   weighs ~900 KB, so it's vendored under /webamp/ and only fetched from
   here, the first time the player actually opens - never on page load
   (it's also excluded from the service worker precache, see
   scripts/fingerprint.mjs).

   The playlist is OverClocked ReMix (https://ocremix.org) - free,
   fan-made video game arrangements, distributed with artist and site
   credit per OCR's content policy. The MP3s stream from the Internet
   Archive's OCR collection: ocremix.org's own mirrors don't send CORS
   headers, and Webamp routes audio through the Web Audio API, whose
   crossOrigin="anonymous" media element refuses opaque responses.
   archive.org sends Access-Control-Allow-Origin: * and supports Range
   requests. Durations ship below so nothing is fetched until play. */

(function () {
  var BUNDLE_SRC = "/webamp/webamp.bundle.min.js";

  var taskBtn = window.MF.btnFor("winamp");

  var webamp = null; /* Webamp instance, once booted */
  var rootEl = null; /* the #webamp element Webamp renders */
  var state = "closed"; /* "open" | "min" | "closed" */
  var bootPromise = null;

  /* --- Playlist: OC ReMix classics --- */
  /* Hand-picked from the most-played tracks on OCR's YouTube channel,
     leaning Donkey Kong Country / Mario / Mega Man. Durations from the
     archive.org file metadata. */

  var OCR_BASE = "https://archive.org/download/OCReMix1to3000v20170528/";

  var TRACKS = [
    ["Stan LePard", "Windows 98: Velkommen", null, null, "https://dn721308.ca.archive.org/0/items/soundcloud-826123573/826123573.mp3"],
    ["zircon", "Super Mario World: Monstrous Turtles!", 226, "Super_Mario_World_Monstrous_Turtles_OC_ReMix"],
    ["Juan Medrano, zircon", "Mega Man 2: Nuclear Flash", 230, "Mega_Man_2_Nuclear_Flash_OC_ReMix"],
    ["Vig", "Donkey Kong Country: Beneath the Surface", 381, "Donkey_Kong_Country_Beneath_the_Surface_OC_ReMix"],
    ["Ben Briggs", "Super Mario 64: Fleeting Ecstasy", 253, "Super_Mario_64_Fleeting_Ecstasy_OC_ReMix"],
    ["Steppo, Juan Medrano, zircon", "Mega Man 3: The Passing of the Blue Crown", 256, "Mega_Man_3_The_Passing_of_the_Blue_Crown_OC_ReMix"],
    ["Mordi, Gibs", "Donkey Kong Country: A Hint of Blue", 385, "Donkey_Kong_Country_A_Hint_of_Blue_OC_ReMix"],
    ["AmIEviL", "Super Mario Bros. 3: Battle Rocks", 174, "Super_Mario_Bros_3_Battle_Rocks_OC_ReMix"],
    ["Disco Dan", "Mega Man 3: Blue Lightning", 521, "Mega_Man_3_Blue_Lightning_OC_ReMix"],
    ["virt", "Donkey Kong Country 2: Dance of the Zinger", 309, "Donkey_Kong_Country_2_Dance_of_the_Zinger_OC_ReMix"],
    ["Protricity", "Mega Man X: Brainsick Metal", 385, "Mega_Man_X_Brainsick_Metal_OC_ReMix"],
    ["Protricity", "Donkey Kong Country 2: Brambles in the Breeze", 332, "Donkey_Kong_Country_2_Brambles_in_the_Breeze_OC_ReMix"],
    ["The OneUps", "Super Mario World: Super Mario's Sleigh Ride", 197, "Super_Mario_World_Super_Mario's_Sleigh_Ride_OC_ReMix"],
  ];

  function playlist() {
    return TRACKS.map(function (t) {
      var directUrl = t[4];
      return {
        metaData: { artist: t[0] + (directUrl ? "" : " (OC ReMix)"), title: t[1] },
        url: directUrl || OCR_BASE + encodeURIComponent(t[3]) + ".mp3",
        duration: t[2],
      };
    });
  }

  /* --- Webamp lifecycle --- */

  function hide() {
    if (rootEl) rootEl.style.display = "none";
  }
  function show() {
    if (rootEl) rootEl.style.display = "";
  }

  function start(Webamp) {
    if (!Webamp.browserIsSupported()) {
      return Promise.reject(new Error("unsupported"));
    }
    webamp = new Webamp({
      initialTracks: playlist(),
      zIndex: 7, /* above .front app windows (6), below the taskbar (10) */
    });

    /* Webamp's own title-bar buttons. Minimize keeps the music going
       and just hides the UI; close also stops playback (Webamp's own
       behavior, same as the real thing). */
    webamp.onMinimize(function () {
      hide();
      state = "min";
      window.MF.activateTopmost();
      window.MF.notify("winamp");
    });
    webamp.onClose(function () {
      hide();
      state = "closed";
      taskBtn.hidden = true;
      window.MF.activateTopmost();
      window.MF.notify("winamp");
    });

    /* Who's playing, for anyone on the desktop who asks. Webamp only
       announces this to whoever subscribes, so keep the last one. */
    if (typeof webamp.onTrackDidChange === "function") {
      webamp.onTrackDidChange(function (t) {
        var meta = (t && t.metaData) || null;
        track = meta
          ? meta.artist
            ? meta.artist + " - " + meta.title
            : meta.title || null
          : null;
        window.MF.notify("winamp");
      });
    }

    /* Webamp centers its window group within the node it renders
       into; .winamp-host covers exactly the desktop (viewport minus
       taskbar), so Winamp opens centered on it. */
    var host = document.createElement("div");
    host.className = "winamp-host";
    document.body.appendChild(host);
    return webamp.renderWhenReady(host).then(function () {
      rootEl = document.getElementById("webamp");
      /* Clicking anywhere in Winamp focuses it, like the 98 windows. */
      rootEl.addEventListener("pointerdown", function () {
        if (state === "open") window.MF.activate("winamp");
      });
    });
  }

  function boot() {
    if (!bootPromise) {
      bootPromise = window.MF
        .loadScript(BUNDLE_SRC, function () { return window.Webamp; })
        .then(start)
        .catch(function (err) {
          bootPromise = null; /* allow retry */
          throw err;
        });
    }
    return bootPromise;
  }

  function open() {
    if (webamp) {
      if (state === "closed") webamp.reopen();
      show();
      state = "open";
      taskBtn.hidden = false;
      window.MF.activate("winamp");
      window.MF.notify("winamp");
      return;
    }
    taskBtn.hidden = false;
    boot().then(
      function () {
        state = "open";
        window.MF.activate("winamp");
        window.MF.notify("winamp");
      },
      function (err) {
        taskBtn.hidden = true;
        window.MF.activateTopmost();
        window.MF.winampError(
          err && err.message === "unsupported"
            ? "Your browser is missing features Winamp needs. (Yes, the irony.)"
            : null
        );
      }
    );
  }

  /* Taskbar button: main.js ignores it (no matching .app-window), so
     minimize/restore is handled here. */
  taskBtn.addEventListener("click", function () {
    if (!webamp) return;
    if (state !== "open") {
      open();
    } else if (taskBtn.classList.contains("active")) {
      hide();
      state = "min";
      window.MF.activateTopmost();
    } else {
      window.MF.activate("winamp");
    }
  });

  /* What Winamp will tell anyone who asks (main.js's app registry).
     Webamp draws its own window outside the desktop's window system, so
     it has to answer for its own state as well - nothing else can. */
  var track = null;
  window.MF.register("winamp", {
    state: function () {
      return state === "min" ? "minimized" : state;
    },
    title: function () {
      return track ? track + " - Winamp" : "Winamp";
    },
    content: function () {
      return { track: track, playing: state !== "closed" && !!track };
    },
  });

  window.MFWinamp = { open: open };
})();

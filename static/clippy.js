/* Office Assistant - lazy-loaded by main.js, only when the assistant is
   actually wanted (the setting is on, or the user turns it on). A homage
   to Clippit, so it has to be charming for about ninety seconds and then
   get out of the way: the idle tips are capped, the close button is a
   permanent opt-out, and nothing runs at all while the clip is hidden.

   The markup lives in the template and ships hidden; this file only
   queries it and toggles classes. The clip itself is the original sprite
   sheet, driven entirely by the generated stylesheet (see
   scripts/gen-clippy.mjs): an animation is a class name, the timing is
   the compositor's problem, and there is no runtime. That stylesheet is
   ~55 kB, so it is fetched on the first show() and never before.

   What it says is drawn from what is actually there. Every window on the
   desktop - the document included - answers the same questions through
   the app registry in main.js, so a tip about the Run button only exists
   on a page with code on it, nothing offers to launch an app that is
   already running, and a situation the reader is visibly in (a post just
   opened, a phrase highlighted, a traceback in Python.exe) is answered
   while it's still true, rather than waiting its turn behind a remark
   about RSS.

   The one thing here that isn't a joke is reading a post out loud. It
   is offered, never started on its own, and it is careful not to fight
   a screen reader that's already doing the job. All appearance is in
   the stylesheet - the only inline style written here is the balloon's
   edge nudge, which is a measurement CSS can't take. */

(function () {
  var root = document.getElementById("assistant");
  if (!root) return; /* template didn't render the assistant - nothing to do */

  var balloon = document.getElementById("assistant-balloon");
  var textEl = document.getElementById("assistant-text");
  var actionsEl = document.getElementById("assistant-actions");
  var clip = document.getElementById("assistant-clip");
  var closeBtn = document.getElementById("assistant-close");
  var sprite = document.getElementById("assistant-sprite");
  var live = document.getElementById("assistant-live");
  var content = document.getElementById("content");

  var IDLE_MS = 45000;
  var IDLE_ANIM_MS = 20000;
  var BALLOON_MS = 14000;
  /* Situations run on a much shorter fuse than small talk: they are
     answers to something that just happened, and an answer that arrives
     forty-five seconds later isn't one. FIRST_MS is the pause after
     arriving somewhere - long enough to look like the clip read the
     page, short enough that it's still the page you're on. */
  var FIRST_MS = 7000;
  var TRIGGER_MS = 1500;
  var RETRY_MS = 3000; /* the balloon was busy; wait for a gap */
  /* An exit is a flourish, not a delay: GoodBye runs four and a half
     seconds, and nobody who just clicked the X should have to watch all
     of it. Whichever comes first, animationend or this, ends the wave.
     It doubles as the safety net for an animationend that never fires. */
  var GOODBYE_MS = 900;
  var SCROLL_SETTLE_MS = 1200;
  var MAX_UNSOLICITED = 3; /* after this the clip shuts up for good */

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var shown = false;
  var wanted = false; /* show() asked for it; hide() may beat the stylesheet */
  var hiding = false;
  var balloonOpen = false;
  var unsolicited = 0;
  var seen = {}; /* tip id -> true, so a session doesn't repeat itself */
  var volunteered = {}; /* said unprompted: never a second time */
  var idleTimer = null, idleAnimTimer = null, balloonTimer = null, hideTimer = null;
  var promptTimer = null; /* a situation waiting to be looked at */
  var focusOnOpen = false; /* set only for explicitly requested balloons */

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /* --- Sprites --- */
  /* Every animation in the sheet, as generated. Playing one is putting
     a-<Name> on the sprite; anything not in here is a typo, and a typo
     would leave a dead class on the element forever. */

  var ANIMS = (
    "Greeting Wave Congratulate Searching Thinking Explain GetAttention Alert " +
    "Writing Print Processing CheckingSomething LookLeft LookRight LookUp LookDown " +
    "GestureLeft GestureRight GestureUp GestureDown RestPose Hide Show GoodBye " +
    "SendMail Save EmptyTrash GetTechy GetWizardy GetArtsy " +
    "Idle1_1 IdleRopePile IdleAtom IdleSideToSide IdleHeadScratch IdleFingerTap " +
    "IdleSnooze IdleEyeBrowRaise"
  ).split(" ");

  var KNOWN = {};
  for (var ai = 0; ai < ANIMS.length; ai++) KNOWN[ANIMS[ai]] = true;

  /* The generator drops the runtime's frame branching, which is what
     used to vary the idles. Varying which idle plays gets the same
     effect for the price of a random index. */
  var IDLES = ANIMS.filter(function (name) {
    return name.indexOf("Idle") === 0;
  });

  var TIP_ANIMS = ["Searching", "CheckingSomething"];
  var READ_ANIMS = ["Writing", "Print"];

  var cssReady = false;
  var cssPromise = null;
  var playing = null, queued = null, looping = false, intro = false, reflow = 0;

  function loadSprites() {
    if (cssReady) return Promise.resolve();
    if (!cssPromise) {
      cssPromise = new Promise(function (resolve, reject) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        /* Written as a plain literal on purpose: the build fingerprints
           assets by text substitution, so this path has to survive into
           the shipped file exactly as spelled here. (map.png is
           referenced from inside that stylesheet, not from here.) */
        link.href = "/clippy/clippy.css";
        link.onload = function () {
          cssReady = true;
          resolve();
        };
        link.onerror = function () {
          reject(new Error("clippy.css failed to load"));
        };
        document.head.appendChild(link);
      }).catch(function (err) {
        cssPromise = null; /* allow a retry on the next show() */
        throw err;
      });
    }
    return cssPromise;
  }

  function play(name, loop) {
    /* Under reduced motion the stylesheet refuses to animate, so setting
       the class would only leave a track that never ends and an
       animationend that never fires. Stay on the rest pose instead. */
    if (!sprite || reduced || !cssReady || !KNOWN[name]) return;
    if (playing) sprite.classList.remove("a-" + playing);
    sprite.classList.remove("loop");
    /* Re-adding a class in the same task is a no-op to the animation
       engine; reading a layout property in between forces the restart,
       or playing the same animation twice running does nothing. */
    reflow = sprite.offsetWidth;
    playing = name;
    looping = !!loop;
    if (looping) sprite.classList.add("loop");
    sprite.classList.add("a-" + name);
  }

  /* Two animations back to back, e.g. the entrance: Show, then Greeting. */
  function playThen(first, second) {
    queued = second;
    play(first, false);
  }

  function rest() {
    if (!sprite) return;
    if (playing) sprite.classList.remove("a-" + playing);
    sprite.classList.remove("loop");
    playing = null;
    looping = false;
    queued = null;
  }

  if (sprite) {
    sprite.addEventListener("animationend", function () {
      var next = queued;
      queued = null;
      if (!looping) {
        if (playing) sprite.classList.remove("a-" + playing);
        playing = null;
      }
      if (next) {
        play(next, false);
        return;
      }
      intro = false;
      if (hiding) finishHide();
    });
  }

  /* --- Bridge to main.js --- */
  /* Everything here is optional: clippy.js may outlive an API change, or
     load before some feature exists. Missing bridge calls degrade to a
     tip that simply says something instead of doing something. */

  function call(name, arg) {
    if (window.MF && typeof window.MF[name] === "function") window.MF[name](arg);
  }

  function action(label, onclick) {
    return { label: label, onclick: onclick };
  }

  /* An action that leaves the balloon open, for controls the user is
     expected to press more than once (pause, then stop). */
  function hold(label, onclick, pressed) {
    return { label: label, onclick: onclick, keep: true, pressed: !!pressed };
  }

  var NO_THANKS = action("No thanks", null); /* null handler = just close */

  /* --- Knowing what's going on --- */
  /* Every window on this desktop answers the same questions - see the
     app registry in main.js - so the clip can look at the page, and at
     what's running on it, instead of pattern-matching the URL and
     hoping. That's the difference between "code blocks on this page
     have a Run button" and knowing whether this page has any code on it
     at all.

     The bridge stays optional, like every other call into main.js:
     without it desk() finds nothing, every condition below is false,
     and the clip falls back to small talk it can't get wrong. */

  var EMPTY = {};

  function desk(id) {
    if (!window.MF || typeof window.MF.app !== "function") return null;
    return window.MF.app(id);
  }

  /* What's inside a window right now. */
  function inside(id) {
    var a = desk(id);
    return (a && a.content()) || EMPTY;
  }

  function isOpen(id) {
    var a = desk(id);
    return !!a && a.open();
  }

  /* The main window's content is the document - and the document is the
     one thing worth working out for ourselves if the bridge is missing,
     because reading a post aloud shouldn't depend on a registry. */
  function here() {
    var c = inside("main");
    if (c !== EMPTY) return c;
    return { kind: /^\/blog\/[^/]+\/?$/.test(location.pathname) ? "post" : "page" };
  }

  function isPost() {
    return here().kind === "post";
  }

  /* Offering to launch something that is already running is precisely
     the kind of help this thing is famous for. */
  function closed(id) {
    return function () { return !isOpen(id); };
  }

  /* Quoting the reader back at themselves, without quoting a paragraph. */
  function shorten(s) {
    return s.length > 40 ? s.slice(0, 37).replace(/\s+\S*$/, "") + "\u2026" : s;
  }

  /* --- Tips --- */
  /* Text stays to a sentence or two; the joke dies at three. `when` is
     what keeps a tip honest - it only enters the draw if the page bears
     it out - and `text` can be a function for the ones that quote what
     they found. */

  function tip(id, text, actions, anim, when) {
    return {
      id: id,
      text: text,
      actions: actions || null,
      anim: anim || null,
      when: when || null,
    };
  }

  function fits(t) {
    return !t.when || t.when();
  }

  /* An offer to actually do the thing, plus the way out. */
  function offer(label, method, arg) {
    return function () {
      return [action(label, function () { call(method, arg); }), NO_THANKS];
    };
  }

  var GREETING = tip(
    "hello",
    "Hi, I'm the Office Assistant. I have no idea what you're doing, but I'm here anyway.",
    null,
    "Congratulate"
  );

  var GENERAL = [
    tip("winamp", "There's a Winamp in the Start menu, and it really does whip the llama's ass.",
      offer("Play something", "openWinamp"), null, closed("winamp")),
    tip("internet", "You can dial up The Internet from the Start menu. It's 1998 in there, so bring patience.",
      offer("Connect", "openBrowser"), null, closed("browser")),
    tip("python", "There's a Python interpreter in here. It runs in your browser, which in 1998 would have been witchcraft.",
      offer("Open Python.exe", "openPyEditor", null), null, closed("pyedit")),
    tip("screensaver", "Would you like to watch some pipes instead of reading? I won't tell anyone.",
      offer("Start screensaver", "startScreensaver")),
    tip("find", "It looks like you're looking for something. Start > Find searches every page on this drive - or just press F3.",
      offer("Find files", "openFind"), null, closed("find")),
    tip("controlpanel", "Control Panel changes the wallpaper and the reading width. Your taste, your consequences."),
    tip("meta", "I'm a homage, not a product. Close me with the X and I'll stay closed - I learned that much."),
    tip("idle", "Nothing on this page needs your attention. I just have very little else to do."),
    /* Things that are only true while something is running. */
    tip("winamp-playing", function () {
      return "\u201c" + inside("winamp").track + "\u201d. Excellent choice, and I say that with no ears.";
    }, null, "GetArtsy", function () { return !!inside("winamp").track; }),
    tip("browser-online", "You're on The Internet. Everything you see there has been dead for twenty-five years.",
      null, null, function () { return !!inside("browser").connected; }),
  ];

  var POST = [
    tip("post-help", function () {
      return "It looks like you're reading about " + here().topic + ". Would you like help?";
    }, offer("Open Python.exe", "openPyEditor", null), null, function () {
      return !!here().topic && !isOpen("pyedit");
    }),
    tip("post-run", "There's Python on this page, and a Run button under every block of it. The paperclip strongly recommends pressing them.",
      function () {
        return [
          action("Run the first one", function () { call("openPyEditor", here().python); }),
          NO_THANKS,
        ];
      }, null, function () { return !!here().python && !isOpen("pyedit"); }),
    tip("post-letter", "It looks like you're writing a lett- sorry, reading a post. The formula is hard to shake."),
    tip("post-math", "If the gradients stop making sense, that's normal. They stopped making sense to the author too.",
      null, null, function () { return !!here().math; }),
  ];

  var INDEX = [
    tip("index-list", "It looks like you're looking for something to read. The list is newest first, as tradition demands."),
    tip("index-rss", "This blog has an RSS feed, which is the most 1998 thing you'll do today.",
      null, null, function () { return !!here().feed; }),
  ];

  var ABOUT = [
    tip("about-author", "It looks like you're researching the author. He's mostly harmless and mostly thinking about gradients."),
    tip("about-effort", "This is a person who built an entire Windows 98 desktop to publish a handful of posts a year."),
  ];

  /* --- Situations --- */
  /* Small talk waits for a lull. These don't: each one exists because
     something just happened, and answering it is worth more than a
     remark about RSS. They're checked in order and before the pool,
     both when the clip is asked for a tip and when it decides to
     volunteer one - which is how the offer to read a post out loud
     became the first thing you hear on a post rather than the twelfth. */

  /* Only ever an offer. Reading starts when someone says it should. */
  var READ_OFFER = tip(
    "post-read",
    function () {
      var m = here().minutes;
      if (!m) return "It looks like you're reading a post. Would you like me to read it out loud?";
      return "It looks like you're reading a post - about " +
        (m === 1 ? "a minute" : m + " minutes") +
        " of it. Would you like me to read it out loud?";
    },
    function () {
      return [action("Read it to me", function () { startReading(); }), NO_THANKS];
    },
    pick(["Alert", "GetAttention"]),
    /* Somewhere with something to read, something to read it with, and
       no read already running. */
    function () { return !reading && canRead(); }
  );

  var SITUATIONS = [
    /* A traceback is the most interesting thing on the screen, and the
       only honest tip about it is the one admitting it can't help. */
    tip("py-error", function () {
      return "It looks like that didn't run: " + shorten(inside("pyedit").error) +
        ". In 1998 we'd have blamed the disk.";
    }, null, "Alert", function () {
      var py = inside("pyedit");
      return isOpen("pyedit") && !!py.error;
    }),

    tip("find-empty", function () {
      return "Nothing on this drive matches \u201c" + shorten(inside("find").text) +
        "\u201d. Fewer words usually helps.";
    }, null, "Searching", function () {
      var f = inside("find");
      return isOpen("find") && !!f.text && f.results === 0;
    }),

    /* Highlighting a phrase is the clearest signal anyone gives this
       desktop that they're looking for something - and Find really can
       search every page on the drive for it. */
    tip("select-find", function () {
      return "It looks like you're looking for something. Shall I search every page for \u201c" +
        shorten(here().selection) + "\u201d?";
    }, function () {
      var q = here().selection;
      return [action("Find it", function () { call("openFind", { text: q }); }), NO_THANKS];
    }, "Searching", function () {
      var s = here().selection || "";
      return !reading && s.length >= 4 && s.length <= 120 && !isOpen("find");
    }),

    /* The bottom of a post: they read the whole thing, so say something
       about that rather than about the Start menu. */
    tip("post-end", function () {
      return here().comments
        ? "You made it to the end. There's a comment box down there, if you have opinions."
        : "That's the end of the post. The blog folder behind this window has the rest of them.";
    }, null, "Congratulate", function () {
      var c = here();
      return c.kind === "post" && c.progress > 0.92;
    }),

    READ_OFFER,
  ];

  /* Volunteering never repeats itself; being asked is allowed to, which
     is why these are two maps rather than one. Stopping a read, for
     instance, makes the offer honest again the next time someone asks
     what the clip can do - without licensing it to nag. */
  function situation(skip) {
    for (var i = 0; i < SITUATIONS.length; i++) {
      var t = SITUATIONS[i];
      if (seen[t.id] || (skip && skip[t.id])) continue;
      if (fits(t)) return t;
    }
    return null;
  }

  function pool() {
    var kind = here().kind;
    var list = GENERAL;
    if (kind === "post") list = list.concat(POST);
    else if (kind === "index") list = list.concat(INDEX);
    if (/^\/about\/?$/.test(location.pathname)) list = list.concat(ABOUT);
    return list.filter(fits);
  }

  function pickTip() {
    /* Whatever the page is actually doing wins. */
    var t = situation(null);
    if (!t) {
      var all = pool();
      var fresh = all.filter(function (x) { return !seen[x.id]; });
      if (!fresh.length) { seen = {}; fresh = all; } /* exhausted: start over */
      t = fresh[Math.floor(Math.random() * fresh.length)];
    }
    seen[t.id] = true;
    return t;
  }

  function speak(t) {
    say(typeof t.text === "function" ? t.text() : t.text, t.actions ? t.actions() : null);
    /* The entrance owns the sprite until it's done; a tip that lands
       mid-Show would cut the clip off halfway out of the box. */
    if (!intro) play(t.anim || pick(TIP_ANIMS), false);
  }

  /* --- Balloon --- */

  function closeBalloon() {
    if (balloonTimer) { clearTimeout(balloonTimer); balloonTimer = null; }
    balloonOpen = false;
    balloon.classList.remove("visible");
    balloon.hidden = true;
    balloon.style.transform = "";
  }

  function say(text, actions) {
    if (!shown) return;
    if (balloonTimer) { clearTimeout(balloonTimer); balloonTimer = null; }
    textEl.textContent = text;

    /* Rebuild the action row from scratch; a stale button from the last
       tip would fire the wrong handler. */
    while (actionsEl.firstChild) actionsEl.removeChild(actionsEl.firstChild);
    var list = actions && actions.length ? actions : [action("OK", null)];
    for (var i = 0; i < list.length; i++) actionsEl.appendChild(button(list[i]));

    balloon.hidden = false;
    balloon.classList.add("visible");
    balloonOpen = true;
    nudge();

    /* Tips with real choices wait for an answer; a plain OK balloon is
       just noise after a while, so it expires on its own. */
    if (!(actions && actions.length)) {
      balloonTimer = setTimeout(closeBalloon, BALLOON_MS);
    } else if (focusOnOpen) {
      actionsEl.firstChild.focus();
    }
    focusOnOpen = false;
  }

  function button(spec) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = spec.label;
    if (spec.pressed != null) b.setAttribute("aria-pressed", spec.pressed ? "true" : "false");
    b.addEventListener("click", function () {
      /* A "keep" button stays in the DOM: replacing the row under the
         pointer would also throw keyboard focus back to the body, which
         is exactly what someone pausing a read doesn't need. */
      if (!spec.keep) closeBalloon();
      if (spec.onclick) spec.onclick(b);
    });
    return b;
  }

  /* The balloon is anchored to the clip, which sits at a screen corner;
     on narrow viewports it can overhang. Measure and shift it back. */
  function nudge() {
    balloon.style.transform = "";
    var r = balloon.getBoundingClientRect();
    var shift = 0;
    if (r.left < 8) shift = 8 - r.left;
    else if (r.right > window.innerWidth - 8) shift = window.innerWidth - 8 - r.right;
    if (shift) balloon.style.transform = "translateX(" + Math.round(shift) + "px)";
  }

  /* --- Reading the post aloud --- */
  /* This is a convenience for people who aren't running a screen
     reader, and it must never get in the way of one that is: the
     article keeps its semantics, focus never moves, and progress is
     reported through a polite live region like any other status. */

  var speech =
    window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"
      ? window.speechSynthesis
      : null;

  var blocks = null; /* [{ el, text }], collected once per page */
  var at = 0;
  var gen = 0; /* bumped on stop, so a cancelled read can't resume itself */
  var reading = false, paused = false;
  var marked = null, userScrolled = false, autoScrollAt = 0;

  var READ_TAGS = { H1: 1, H2: 1, H3: 1, H4: 1, P: 1, LI: 1, BLOCKQUOTE: 1 };
  /* Anything that will be visited on its own, so a container knows
     whether it still owns its text. Inline maths is deliberately not in
     here - it belongs to the sentence around it. */
  var READABLE = "p,li,blockquote,pre,h1,h2,h3,h4,math[display='block']";

  function announce(msg) {
    if (live) live.textContent = msg; /* textContent: this is never markup */
  }

  function skipped(el) {
    var tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME") return true;
    /* Buttons are page furniture, not prose - this is also what keeps
       the "Try me" label out of the middle of a code sample. */
    if (tag === "BUTTON") return true;
    /* The giscus comments are somebody else's document. */
    if (tag === "FIELDSET" && el.classList && el.classList.contains("comments")) return true;
    if (el.hidden) return true;
    return el.getAttribute && el.getAttribute("aria-hidden") === "true";
  }

  function textOf(el, ownOnly) {
    var out = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toUpperCase();
      /* Temml renders maths to MathML with the LaTeX kept as an
         annotation. Both read as gibberish, so the node is dropped and
         the sentence simply closes over the gap. */
      if (tag === "MATH" || tag === "PRE") continue;
      if (skipped(n)) continue;
      if (ownOnly && READ_TAGS[tag]) continue;
      out += textOf(n, ownOnly);
    }
    return out;
  }

  function push(out, el, raw) {
    var text = raw.replace(/\s+/g, " ").trim();
    if (text) out.push({ el: el, text: text });
  }

  function walk(node, out) {
    for (var el = node.firstElementChild; el; el = el.nextElementSibling) {
      if (skipped(el)) continue;
      var tag = el.tagName.toUpperCase();
      /* Source read out character by character is unlistenable, and a
         formula is worse. Name them and move on. Only display maths is
         a block of its own - inline maths belongs to the sentence
         around it, which drops it, wherever that sentence lives. */
      if (tag === "PRE") { push(out, el, "Code sample."); continue; }
      if (tag === "MATH") {
        if (el.getAttribute("display") === "block") push(out, el, "A formula.");
        continue;
      }
      if (READ_TAGS[tag]) {
        if (el.querySelector(READABLE)) {
          /* A list item with a nested list, or a quote made of
             paragraphs: read the text it owns itself, then descend. */
          push(out, el, textOf(el, true));
          walk(el, out);
        } else {
          push(out, el, textOf(el, false));
        }
        continue;
      }
      walk(el, out);
    }
  }

  function canRead() {
    if (!speech || !isPost()) return false;
    if (blocks === null) {
      blocks = [];
      var article = document.querySelector("#content article");
      if (article) walk(article, blocks);
    }
    return blocks.length > 0;
  }

  function clearMark() {
    if (!marked) return;
    marked.removeAttribute("aria-current");
    marked.classList.remove("reading-now");
    marked = null;
  }

  function mark(el) {
    clearMark(); /* exactly one block is ever current */
    marked = el;
    el.setAttribute("aria-current", "true");
    el.classList.add("reading-now");
    follow(el);
  }

  function follow(el) {
    if (userScrolled) return; /* they're reading ahead; leave them to it */
    autoScrollAt = Date.now();
    el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }

  function readingBalloon() {
    say("Reading the post out loud. Say the word and I'll stop.", [
      hold(paused ? "Resume" : "Pause", togglePause, paused),
      action("Stop", function () { stopReading(true); }),
    ]);
    if (!playing) play(pick(READ_ANIMS), false);
  }

  function startReading() {
    if (reading || !canRead()) return;
    gen++;
    reading = true;
    paused = false;
    at = 0;
    userScrolled = false;
    speech.cancel(); /* whatever a previous read left queued */
    announce("Reading the post aloud.");
    readingBalloon();
    next();
  }

  function next() {
    if (!reading) return;
    clearMark();
    if (at >= blocks.length) { finishReading(); return; }
    var b = blocks[at++];
    mark(b.el);

    /* One utterance per block: Chrome quietly truncates long ones after
       about fifteen seconds, and chaining is also what advances the
       highlight without a second timer to keep in step. */
    var u = new SpeechSynthesisUtterance(b.text);
    u.lang = document.documentElement.lang || "en";
    var mine = gen;
    u.onend = function () { if (reading && mine === gen) next(); };
    /* An error on one block shouldn't end the reading; a cancel arrives
       as an error too, but the generation check has already ruled that
       out by the time it fires. */
    u.onerror = u.onend;
    speech.speak(u);

    if (!playing) play(pick(READ_ANIMS), false);
  }

  function togglePause(btn) {
    if (!reading) return;
    if (paused) {
      speech.resume();
      paused = false;
      announce("Resumed.");
    } else {
      speech.pause();
      paused = true;
      announce("Paused.");
    }
    if (btn) {
      btn.textContent = paused ? "Resume" : "Pause";
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
    }
  }

  /* Silent when the assistant is simply going away: "Stopped." is the
     answer to a Stop button, not to the whole clip being dismissed. */
  function stopReading(announceIt) {
    if (speech) {
      speech.cancel();
      /* cancel() empties the queue but leaves the engine paused, and a
         paused engine swallows the next read in silence too. */
      if (paused) speech.resume();
    }
    if (!reading) return;
    gen++;
    reading = false;
    paused = false;
    clearMark();
    rest();
    if (announceIt) {
      announce("Stopped.");
      /* Stopping a read isn't refusing one: the offer is honest again
         the next time someone asks the clip what it can do. It stays in
         `volunteered`, though - being asked is not a licence to nag. */
      delete seen[READ_OFFER.id];
    }
  }

  function finishReading() {
    gen++;
    reading = false;
    paused = false;
    clearMark();
    announce("Finished reading.");
    rest();
    say("That's the whole post. I'll let you get on with your day.", null);
    play("Congratulate", false);
  }

  /* Speech outlives the document in some browsers, which is how you end
     up being read a post you navigated away from two pages ago. */
  window.addEventListener("pagehide", function () {
    if (speech) speech.cancel();
  });

  if (content) {
    content.addEventListener("scroll", function () {
      if (!reading || userScrolled) return;
      /* A smooth programmatic scroll emits events of its own for a
         while; past that window, the scrolling is the reader's. */
      if (Date.now() - autoScrollAt < SCROLL_SETTLE_MS) return;
      userScrolled = true;
    }, { passive: true });
  }

  /* --- Idling and volunteering --- */

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!shown || unsolicited >= MAX_UNSOLICITED) return;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (!shown) return;
      /* Never talk over an open balloon - but don't drop the thought
         either, or the one tip that had a reason to exist is the one
         that never gets said. */
      if (balloonOpen) { scheduleIdle(); return; }
      unsolicited++;
      speak(pickTip());
      scheduleIdle();
    }, IDLE_MS);
  }

  /* The idle timer waits for the reader to stop moving, which is right
     for filler and wrong for anything that answers a situation: someone
     who has just opened a post is *busy* reading it, and a scroll every
     two seconds would postpone the offer to read it out loud forever.
     So situations keep their own clock, and the mouse can't reset it. */
  function considerSoon(ms) {
    if (promptTimer || !shown || unsolicited >= MAX_UNSOLICITED) return;
    promptTimer = setTimeout(function () {
      promptTimer = null;
      if (!shown || unsolicited >= MAX_UNSOLICITED) return;
      if (balloonOpen) { considerSoon(RETRY_MS); return; }
      var t = situation(volunteered);
      if (!t) return;
      seen[t.id] = true;
      volunteered[t.id] = true;
      unsolicited++;
      speak(t);
      scheduleIdle(); /* small talk starts its clock again */
    }, ms);
  }

  function scheduleIdleAnim() {
    if (idleAnimTimer) clearTimeout(idleAnimTimer);
    idleAnimTimer = null;
    /* Nothing to schedule when the animation would be suppressed
       anyway - a timer per twenty seconds firing class changes that no
       stylesheet will honour is just noise. */
    if (!shown || reduced) return;
    idleAnimTimer = setTimeout(function () {
      idleAnimTimer = null;
      /* An idle is filler: it waits for the sprite to be free. */
      if (shown && !playing && !hiding) play(pick(IDLES), false);
      scheduleIdleAnim();
    }, IDLE_ANIM_MS + Math.random() * IDLE_ANIM_MS);
  }

  function activity() {
    scheduleIdle();
    scheduleIdleAnim();
  }

  /* The clocks that make the clip talk. The balloon's own expiry isn't
     one of them - a balloon already on screen should still go away. */
  function stopChatter() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (idleAnimTimer) { clearTimeout(idleAnimTimer); idleAnimTimer = null; }
    if (promptTimer) { clearTimeout(promptTimer); promptTimer = null; }
  }

  function stopTimers() {
    stopChatter();
    if (balloonTimer) { clearTimeout(balloonTimer); balloonTimer = null; }
  }

  /* --- Wiring --- */
  /* Listeners stay bound for the page's life and bail out early while
     hidden; the timers are what actually cost something, and those are
     torn down in hide(). */

  document.addEventListener("mousemove", activity);
  document.addEventListener("click", activity);
  document.addEventListener("keydown", function (e) {
    activity();
    if (e.key === "Escape" && balloonOpen) closeBalloon();
  });

  /* Capture, and on window: the thing that scrolls here is the window
     body, and scroll events from an element don't bubble - so the plain
     document listener this used to have never saw a reader scrolling a
     post, which is the one bit of activity that matters most. */
  var lookedAt = 0;
  window.addEventListener("scroll", function () {
    activity();
    if (!shown || reading) return;
    /* Scrolling fires in floods and here() measures the document, so
       look at most twice a second. */
    var now = Date.now();
    if (now - lookedAt < 500) return;
    lookedAt = now;
    if (here().progress > 0.92) considerSoon(TRIGGER_MS);
  }, { passive: true, capture: true });

  /* Highlighting a phrase is a question about it. Check the selection
     itself rather than the page (cheap, and no layout): a plain click
     also fires this, and a click is not a question. */
  document.addEventListener("selectionchange", function () {
    if (!shown || reading) return;
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return;
    considerSoon(TRIGGER_MS);
  });

  /* Something opened, closed, or finished doing whatever it was doing -
     a script that raised, a search that found nothing. That's the most
     interesting moment there is, so look while it's still true. */
  if (window.MF && typeof window.MF.on === "function") {
    window.MF.on("app", function () {
      if (shown && !reading) considerSoon(TRIGGER_MS);
    });
  }

  /* Nobody is reading a hidden tab: stop the clocks rather than spend
     the tip budget on an empty room. */
  document.addEventListener("visibilitychange", function () {
    if (!shown) return;
    if (document.hidden) stopChatter();
    else {
      activity();
      considerSoon(FIRST_MS);
    }
  });

  clip.addEventListener("click", function () {
    if (balloonOpen) { closeBalloon(); return; }
    focusOnOpen = true; /* asked for, so taking focus is fair */
    /* Mid-read the clip is the way back to the controls, not a tip. */
    if (reading) { readingBalloon(); return; }
    speak(pickTip());
  });

  /* The X is the opt-out, and the only thing here that persists: once
     dismissed the assistant shouldn't come back on the next page. */
  closeBtn.addEventListener("click", function () {
    hide();
    if (window.MF && typeof window.MF.setSetting === "function") {
      window.MF.setSetting("assistant", false);
    }
  });

  /* --- Public API --- */

  function reveal(greet) {
    if (!wanted || shown) return;
    shown = true;
    root.hidden = false;
    root.classList.add("visible");
    intro = !reduced;
    playThen("Show", "Greeting");
    activity();
    if (greet) speak(GREETING);
    /* Arriving somewhere is itself a situation. On a post that means
       the offer to read it out loud turns up while you're still at the
       top of it, which is the only moment the offer is worth anything. */
    considerSoon(FIRST_MS);
  }

  function show(opts) {
    var greet = !!(opts && opts.greet);
    wanted = true;
    hiding = false;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (shown) {
      if (greet) speak(GREETING);
      return;
    }
    /* The stylesheet carries the sprite's own size and rest frame, so
       revealing before it lands would flash an unstyled box. A failed
       fetch is not worth a broken feature: show the clip anyway, minus
       its animations, and try the stylesheet again next time. */
    loadSprites().then(
      function () { reveal(greet); },
      function () { reveal(greet); }
    );
  }

  function hide() {
    var wasShown = shown;
    wanted = false;
    shown = false;
    stopTimers();
    closeBalloon();
    stopReading(false);
    /* No goodbye to play if nobody saw the hello - and none under
       reduced motion, where the animation would never end. */
    if (!wasShown || reduced || !cssReady) { finishHide(); return; }
    hiding = true;
    queued = null;
    play("GoodBye", false);
    hideTimer = setTimeout(finishHide, GOODBYE_MS);
  }

  function finishHide() {
    hiding = false;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    rest();
    root.classList.remove("visible");
    root.hidden = true;
  }

  window.MFClippy = {
    show: show,
    hide: hide,
    say: say,
    visible: function () { return shown; },
  };
})();

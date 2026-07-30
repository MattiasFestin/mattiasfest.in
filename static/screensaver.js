/* Screensaver - lazy-loaded by main.js the first time one is armed.
   Four of the savers that shipped with Windows 98, on a plain 2D canvas:
   Starfield Simulation, Flying Windows, Mystify Your Mind and 3D Pipes.
   No WebGL, no assets, no dependencies - the whole point is that it
   costs nothing until the desktop has actually gone idle. main.js owns
   the idle timer and the settings; this module only knows how to run a
   named mode, how to stop, and how to report that it stopped
   (opts.onstop) so the caller can re-arm. */

(function () {
  var canvas = null, ctx = null;
  var mode = null; /* the running saver: { init, frame } */
  var raf = 0, last = 0, on = false;
  var pending = null; /* onstop belonging to the current start, fired once */
  var startedAt = 0, origin = null;
  var w = 0, h = 0, dpr = 1, reduce = false;

  /* A mousemove right after start is usually the tail of the gesture
     that left the desktop idle (or an inertial scroll), so ignore
     pointer motion briefly and then demand a deliberate nudge. */
  var GRACE_MS = 400, MOVE_PX = 4;

  /* --- Canvas --- */

  function ensureCanvas() {
    if (canvas) return ctx;
    /* Adopt an existing node if this file somehow gets evaluated twice
       (a stale cached copy alongside a fresh one, say). Two stacked
       full-screen canvases would leave a dead black overlay behind
       after the visible one stopped. */
    canvas = document.getElementById("screensaver");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "screensaver";
      canvas.id = "screensaver";
      /* Decorative, and it covers the whole document while it runs -
         screen readers should keep reading the desktop underneath. */
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
    }
    canvas.hidden = true;
    try { ctx = canvas.getContext("2d"); } catch (e) { ctx = null; }
    return ctx;
  }

  /* Backing store in device pixels, drawing coordinates in CSS pixels.
     Re-run on resize and whenever the window lands on a display with a
     different devicePixelRatio, or the canvas keeps the old resolution. */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearBlack() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* --- Starfield / Flying Windows --- */

  /* Both are the same toy - fly through a cube of points, project them
     with k = 128 / z - so they differ only in what gets stamped at the
     projected position. */
  function makeField(count, speed, draw) {
    var MAXZ = 900, pts = [];

    function respawn(p, z) {
      p.x = rand(-w, w);
      p.y = rand(-h, h);
      p.z = z;
    }

    return {
      init: function () {
        pts = [];
        for (var i = 0; i < count; i++) {
          var p = {};
          respawn(p, rand(1, MAXZ));
          pts.push(p);
        }
      },
      frame: function (dt) {
        /* Cleared to solid black every frame: the translucent-fill
           "trail" is a modern shortcut, the originals had none. */
        clearBlack();
        var cx = w / 2, cy = h / 2;
        var v = (reduce ? speed * 0.12 : speed) * dt;
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          p.z -= v;
          if (p.z <= 1) respawn(p, MAXZ);
          var k = 128 / p.z, sx = cx + p.x * k, sy = cy + p.y * k;
          if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
          draw(sx, sy, 1 - p.z / MAXZ);
        }
      },
    };
  }

  function starfield() {
    return makeField(450, 420, function (sx, sy, c) {
      var s = c > 0.85 ? 3 : c > 0.55 ? 2 : 1;
      var v = Math.round(70 + 185 * c);
      ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
      /* Integer rects only: subpixel stars smear into grey and lose the
         hard one-pixel sparkle of the VGA original. */
      ctx.fillRect(sx | 0, sy | 0, s, s);
    });
  }

  /* Red, green, blue, yellow, clockwise from top left - the flag panes. */
  var FLAG = ["#ff0000", "#00a800", "#0000ff", "#ffc800"];

  function flying() {
    return makeField(60, 170, function (sx, sy, c) {
      var half = Math.max(2, Math.round(c * 26));
      var gap = half > 4 ? 1 : 0; /* the black seam between panes */
      var x = Math.round(sx) - half, y = Math.round(sy) - half;
      for (var i = 0; i < 4; i++) {
        ctx.fillStyle = FLAG[i];
        ctx.fillRect(x + (i % 2) * half, y + (i > 1 ? half : 0), half - gap, half - gap);
      }
    });
  }

  /* --- Mystify Your Mind --- */

  function mystify() {
    var TRAIL = 12, SAMPLE = 1 / 15; /* seconds between recorded polygons */
    var threads = [], acc = 0;

    return {
      init: function () {
        var sp = reduce ? 34 : 95;
        threads = [];
        for (var t = 0; t < 2; t++) {
          var pts = [];
          for (var i = 0; i < 4; i++) {
            var a = rand(0, Math.PI * 2);
            pts.push({ x: rand(0, w), y: rand(0, h), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
          }
          threads.push({ pts: pts, hue: t * 140, trail: [] });
        }
      },
      frame: function (dt) {
        var i, j, t, p;
        for (i = 0; i < threads.length; i++) {
          t = threads[i];
          t.hue = (t.hue + (reduce ? 8 : 22) * dt) % 360;
          for (j = 0; j < t.pts.length; j++) {
            p = t.pts[j];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.x < 0) { p.x = 0; p.vx = -p.vx; }
            if (p.x > w) { p.x = w; p.vx = -p.vx; }
            if (p.y < 0) { p.y = 0; p.vy = -p.vy; }
            if (p.y > h) { p.y = h; p.vy = -p.vy; }
          }
        }

        /* The trail is an explicit ring of past polygons rather than a
           faded overdraw, which is what keeps every edge a crisp 1px
           hairline the way it was at 640x480. */
        acc += dt;
        if (acc >= SAMPLE) {
          acc = 0;
          for (i = 0; i < threads.length; i++) {
            t = threads[i];
            var snap = { hue: t.hue, pts: [] };
            for (j = 0; j < t.pts.length; j++) snap.pts.push({ x: t.pts[j].x, y: t.pts[j].y });
            t.trail.push(snap);
            if (t.trail.length > TRAIL) t.trail.shift();
          }
        }

        clearBlack();
        ctx.lineWidth = 1;
        for (i = 0; i < threads.length; i++) {
          t = threads[i];
          for (j = 0; j < t.trail.length; j++) {
            var s = t.trail[j], age = (j + 1) / t.trail.length;
            ctx.strokeStyle =
              "hsl(" + Math.round(s.hue) + ",100%," + Math.round(6 + 46 * age) + "%)";
            ctx.beginPath();
            ctx.moveTo(s.pts[0].x, s.pts[0].y);
            for (var k = 1; k < s.pts.length; k++) ctx.lineTo(s.pts[k].x, s.pts[k].y);
            ctx.closePath();
            ctx.stroke();
          }
        }
      },
    };
  }

  /* --- 3D Pipes --- */

  /* Faked in 2D on an isometric lattice. The real one was OpenGL, but at
     a glance the read is just "tubes turning at right angles", and an iso
     projection with shaded strokes sells that for a few hundred bytes.
     Unlike the others this never clears per frame - it paints and
     accumulates until the screen is full. */
  function pipes() {
    var S = 22; /* lattice step, CSS px */
    var RUNS = 5; /* concurrent pipes */
    var RUN_MAX = 46; /* segments before a run is retired and reseeded */
    var LIMIT = 850; /* total segments before the screen counts as full */
    var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    var PALETTE = [
      [0, 190, 190], [225, 60, 60], [80, 110, 255],
      [225, 210, 60], [60, 200, 90], [210, 80, 215],
    ];
    /* Concentric passes: width, tint (-1 black .. +1 white), offset.
       All centred on the same line except the last hairline, so the
       result is a solid cylinder with a dark rim and a bright specular
       band - offsetting the wide passes would leave a hollow outline. */
    var RAMP = [[14, -0.62, 0], [11, -0.34, 0], [8, -0.08, 0], [5, 0.26, 0], [2, 0.62, -1.5]];
    var runs = [], drawn = 0, acc = 0;

    function mix(c, t) {
      var to = t < 0 ? 0 : 255, k = Math.abs(t);
      return "rgb(" +
        Math.round(c[0] + (to - c[0]) * k) + "," +
        Math.round(c[1] + (to - c[1]) * k) + "," +
        Math.round(c[2] + (to - c[2]) * k) + ")";
    }

    function iso(c) {
      return {
        x: w / 2 + (c.x - c.y) * S * 0.866,
        y: h / 2 + (c.x + c.y) * S * 0.5 - c.z * S,
      };
    }

    /* Seed from a random *screen* point rather than a random cell: cells
       near the lattice origin all project to the middle, which made every
       run radiate from one spot. */
    function seed(r) {
      var z = Math.round(rand(-4, 4));
      var u = (rand(0.12, 0.88) * w - w / 2) / (S * 0.866);
      var v = (rand(0.12, 0.88) * h - h / 2 + z * S) / (S * 0.5);
      r.c = { x: Math.round((u + v) / 2), y: Math.round((v - u) / 2), z: z };
      r.d = pick(DIRS);
      r.len = 0;
      r.p = iso(r.c);
      r.prev = null;
      var col = pick(PALETTE);
      r.ramp = [];
      for (var i = 0; i < RAMP.length; i++) {
        r.ramp.push({ w: RAMP[i][0], c: mix(col, RAMP[i][1]), o: RAMP[i][2] });
      }
    }

    function reset() {
      clearBlack();
      drawn = 0;
      runs = [];
      for (var i = 0; i < RUNS; i++) { var r = {}; seed(r); runs.push(r); }
    }

    function inset(a, b, d) {
      var dx = b.x - a.x, dy = b.y - a.y, m = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: a.x + (dx / m) * d, y: a.y + (dy / m) * d };
    }

    /* Draws the new segment, carrying every pass but the widest, darkest
       one back over the previous segment as well, and starting each pass
       a half-width in so its round cap stops exactly at the joint. A cap
       or a dark pass that bleeds backwards clips the lit core of the tube
       we came from, and the run reads as a string of beads. */
    function tube(prev, a, b, ramp) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (var i = 0; i < ramp.length; i++) {
        var o = ramp[i].o, back = i && prev;
        var head = back ? prev : a;
        var p = prev ? inset(head, back ? a : b, ramp[i].w / 2) : head;
        ctx.strokeStyle = ramp[i].c;
        ctx.lineWidth = ramp[i].w;
        ctx.beginPath();
        ctx.moveTo(p.x + o, p.y + o);
        if (back) ctx.lineTo(a.x + o, a.y + o);
        ctx.lineTo(b.x + o, b.y + o);
        ctx.stroke();
      }
    }

    /* Same ramp as a ball joint, a touch fatter than the tube so an elbow
       reads as a sphere. Corners only - on a straight run it would sit
       across the pipe and bead it. */
    function ball(p, ramp) {
      for (var i = 0; i < ramp.length; i++) {
        ctx.fillStyle = ramp[i].c;
        ctx.beginPath();
        ctx.arc(p.x + ramp[i].o, p.y + ramp[i].o, ramp[i].w * 0.58, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function step(r) {
      var turned = Math.random() < 0.3, d;
      if (turned) {
        /* Any direction but a U-turn back down the pipe we just drew. */
        do { d = pick(DIRS); } while (d[0] === -r.d[0] && d[1] === -r.d[1] && d[2] === -r.d[2]);
        r.d = d;
      }
      var next = { x: r.c.x + r.d[0], y: r.c.y + r.d[1], z: r.c.z + r.d[2] };
      var to = iso(next);
      /* Retire a run once it's long enough or has wandered off, and start
         a fresh one elsewhere, so the screen keeps filling evenly. */
      if (r.len >= RUN_MAX || to.x < 24 || to.x > w - 24 || to.y < 24 || to.y > h - 24) {
        seed(r);
        return;
      }
      tube(r.prev, r.p, to, r.ramp);
      if (turned && r.len) ball(r.p, r.ramp);
      r.prev = r.p;
      r.c = next;
      r.p = to;
      r.len++;
      drawn++;
    }

    return {
      init: reset,
      frame: function (dt) {
        /* Segments per second, not per frame - Pipes should build up on
           its own clock, briskly enough to populate the screen but slow
           enough to watch. */
        var period = 1 / (reduce ? 3 : 20);
        acc += dt;
        while (acc >= period) {
          acc -= period;
          for (var i = 0; i < runs.length; i++) step(runs[i]);
          if (drawn > LIMIT) { reset(); break; }
        }
      },
    };
  }

  var MODES = { starfield: starfield, flying: flying, mystify: mystify, pipes: pipes };

  /* --- Loop --- */

  function loop(now) {
    if (!on) return; /* a stop() between frames must win */
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1; /* throttled tab: don't teleport anything */
    mode.frame(dt);
    raf = requestAnimationFrame(loop);
  }

  /* --- Dismissal --- */

  function onDismiss() { stop(); }

  function onMove(e) {
    if (Date.now() - startedAt < GRACE_MS) return;
    if (!origin) { origin = { x: e.clientX, y: e.clientY }; return; }
    var dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    if (dx * dx + dy * dy >= MOVE_PX * MOVE_PX) stop();
  }

  function onResize() {
    resize();
    /* Every saver seeds itself from the viewport, so a resize restarts
       the geometry rather than stretching it. */
    mode.init();
    clearBlack();
  }

  function onVisibility() {
    if (document.hidden) stop();
  }

  var KEYS = ["mousedown", "keydown", "wheel", "touchstart"];

  function listen(add) {
    var fn = add ? window.addEventListener : window.removeEventListener;
    for (var i = 0; i < KEYS.length; i++) fn.call(window, KEYS[i], onDismiss, true);
    fn.call(window, "mousemove", onMove, true);
    fn.call(window, "resize", onResize, false);
    var doc = add ? document.addEventListener : document.removeEventListener;
    doc.call(document, "visibilitychange", onVisibility, false);
  }

  /* --- Public API --- */

  function teardown(silent) {
    if (!on) return;
    on = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    listen(false);
    canvas.hidden = true;
    mode = null;
    var cb = pending;
    pending = null;
    /* onstop fires last, once the overlay is really gone, so a handler
       that re-arms the idle timer never sees a half-torn-down saver. */
    if (cb && !silent) cb();
  }

  function stop() { teardown(false); }

  function start(name, opts) {
    /* Idempotent: starting again just swaps modes. The previous onstop is
       dropped rather than fired, because nothing stopped - firing it would
       re-arm the caller's idle timer (or close its preview) while pixels
       are still on screen. */
    teardown(true);
    pending = (opts && opts.onstop) || null;

    if (!ensureCanvas()) {
      /* No 2D context (canvas disabled, ancient browser): behave as if the
         saver had run and immediately finished. */
      var cb = pending;
      pending = null;
      if (cb) cb();
      return;
    }

    reduce = !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    mode = (MODES[name] || MODES.starfield)();
    canvas.hidden = false;
    resize();
    mode.init();
    clearBlack();

    on = true;
    last = 0;
    origin = null;
    startedAt = Date.now();
    listen(true);
    raf = requestAnimationFrame(loop);
  }

  window.MFScreensaver = {
    start: start,
    stop: stop,
    running: function () { return on; },
  };
})();

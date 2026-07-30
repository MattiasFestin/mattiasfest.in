/* "Find: All Files" - lazy-loaded by main.js when Find is opened.
   A restaging of the Windows 98 Find dialog (Start > Find > Files or
   Folders...), searching this site as if it were a hard drive: posts are
   HTML documents in C:\Blog, the blog section is a folder, and results
   arrive in a five-column list you can sort by clicking the headers.

   Two data sources, deliberately split:

     - the catalog (inlined in every page by base.html) holds names,
       folders, dates and sizes. Everything except "Containing text"
       runs off it, so a name search costs no request at all.
     - Zola's elasticlunr index (~1 MB) is fetched only when someone
       actually fills in "Containing text" - warmed on focus, so the
       download usually finishes before they hit Find Now. */

(function () {
  var win = document.querySelector('[data-win="find"]');
  var LUNR_SRC = win.dataset.lunrSrc;
  var INDEX_SRC = win.dataset.indexSrc;

  var form = document.getElementById("find-form");
  var namedEl = document.getElementById("find-named");
  var textEl = document.getElementById("find-text");
  var lookEl = document.getElementById("find-look");
  var subsEl = document.getElementById("find-subfolders");
  var fromEl = document.getElementById("find-from");
  var toEl = document.getElementById("find-to");
  var monthsEl = document.getElementById("find-months");
  var daysEl = document.getElementById("find-days");
  var typeEl = document.getElementById("find-type");
  var sizeOpEl = document.getElementById("find-size-op");
  var sizeEl = document.getElementById("find-size");

  var nowBtn = document.getElementById("find-now");
  var stopBtn = document.getElementById("find-stop");
  var newBtn = document.getElementById("find-new");

  var resultsEl = document.getElementById("find-results");
  var rowsEl = document.getElementById("find-rows");
  var emptyEl = document.getElementById("find-empty");
  var statusEl = document.getElementById("find-status");
  var titleEl = document.getElementById("find-title");
  var taskLabel = document.getElementById("find-task-label");

  /* --- The catalog (our "file system") --- */

  /* Zola's index keys documents by permalink; the catalog's home entry
     has no trailing slash. Compare on a canonical form of both. */
  function urlKey(url) {
    return String(url).replace(/\/+$/, "");
  }

  var FILES = [];
  try {
    JSON.parse(document.getElementById("find-catalog").textContent).forEach(function (e) {
      var dir = e.k === "dir";
      FILES.push({
        url: e.u,
        key: urlKey(e.u),
        /* Name is the document title - the same "Name" column the blog
           folder shows. The 8.3-era file name is matched too, so
           "*.html" and "0007*" work the way muscle memory expects. */
        name: e.t,
        file: e.n,
        folder: e.p,
        dir: dir,
        type: dir ? "File Folder" : "HTML Document",
        date: e.d || "",
        /* Words -> bytes -> KB. Rough, and so was Explorer. */
        size: dir ? null : Math.max(1, Math.round(((e.w || 0) * 6) / 1024)),
      });
    });
  } catch (e) {
    /* No catalog: the window still opens and says so. */
  }

  /* --- The full-text index (fetched on demand) --- */

  var indexPromise = null;

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = window.MF.loadScript(LUNR_SRC, function () { return window.elasticlunr; })
      .then(function () {
        return window.MF.loadScript(INDEX_SRC, function () { return window.searchIndex; });
      })
      .then(function (raw) {
        return window.elasticlunr.Index.load(raw);
      })
      .catch(function (err) {
        indexPromise = null; // allow retry
        throw err;
      });
    return indexPromise;
  }

  /* Start the download as soon as the field is touched: by the time
     anything has been typed and submitted, it's usually there. */
  textEl.addEventListener("focus", function () {
    loadIndex().catch(function () {});
  });

  function textMatches(index, query) {
    var opts = {
      fields: { title: { boost: 2 }, body: { boost: 1 } },
      bool: "AND",
      expand: true,
    };
    var hits = index.search(query, opts);
    /* Every word required is the useful default; if that finds nothing,
       fall back to any word rather than shrugging at the user. */
    if (!hits.length) {
      opts.bool = "OR";
      hits = index.search(query, opts);
    }
    var scores = {};
    hits.forEach(function (h) {
      scores[urlKey(h.ref)] = h.score;
    });
    return scores;
  }

  /* --- Criteria --- */

  function namedFilter() {
    var q = namedEl.value.trim();
    if (!q) return null;
    if (/[*?]/.test(q)) {
      var rx = new RegExp(
        "^" +
          q.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
          "$",
        "i"
      );
      return function (f) {
        return rx.test(f.file) || rx.test(f.name);
      };
    }
    var needle = q.toLowerCase();
    return function (f) {
      return (
        f.file.toLowerCase().indexOf(needle) !== -1 ||
        f.name.toLowerCase().indexOf(needle) !== -1
      );
    };
  }

  function scopeFilter() {
    var look = lookEl.value;
    if (look === "*") return null;
    var subs = subsEl.checked;
    var prefix = look.charAt(look.length - 1) === "\\" ? look : look + "\\";
    return function (f) {
      if (f.folder === look) return true;
      return subs && f.folder.indexOf(prefix) === 0;
    };
  }

  function ymd(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function dateFilter() {
    var mode = (form.querySelector('input[name="find-when"]:checked') || {}).value;
    if (!mode || mode === "all") return null;
    var from = "";
    var to = "";
    if (mode === "between") {
      from = fromEl.value;
      to = toEl.value;
    } else {
      var d = new Date();
      if (mode === "months") d.setMonth(d.getMonth() - (Number(monthsEl.value) || 0));
      else d.setDate(d.getDate() - (Number(daysEl.value) || 0));
      from = ymd(d);
      to = ymd(new Date()); /* "the previous N" ends today, not later */
    }
    if (!from && !to) return null;
    /* ISO dates sort lexicographically, so string compare is enough. */
    return function (f) {
      if (!f.date) return false;
      if (from && f.date < from) return false;
      if (to && f.date > to) return false;
      return true;
    };
  }

  function typeFilter() {
    var want = typeEl.value;
    if (want === "*") return null;
    return function (f) {
      return (f.dir ? "dir" : "html") === want;
    };
  }

  function sizeFilter() {
    var op = sizeOpEl.value;
    if (!op) return null;
    var kb = Number(sizeEl.value) || 0;
    return function (f) {
      if (f.size == null) return false; /* folders have no size */
      return op === "min" ? f.size >= kb : f.size <= kb;
    };
  }

  /* --- Sorting --- */

  var sortKey = "name";
  var sortAsc = true;
  var lastResults = [];
  var searched = false; /* a search has been run and has settled */

  function sortValue(f, key) {
    if (key === "size") return f.size == null ? -1 : f.size;
    if (key === "folder") return f.folder.toLowerCase();
    if (key === "type") return f.type.toLowerCase();
    if (key === "date") return f.date;
    return f.name.toLowerCase();
  }

  function sortList(list) {
    var dir = sortAsc ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var av = sortValue(a, sortKey);
      var bv = sortValue(b, sortKey);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.name.localeCompare(b.name);
    });
  }

  Array.prototype.slice.call(document.querySelectorAll(".find-sort")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.dataset.sort;
      if (key === sortKey) sortAsc = !sortAsc;
      else {
        sortKey = key;
        sortAsc = true;
      }
      markSortHeaders();
      render(sortList(lastResults), true);
    });
  });

  function markSortHeaders() {
    Array.prototype.slice.call(document.querySelectorAll(".find-sort")).forEach(function (b) {
      var on = b.dataset.sort === sortKey;
      b.classList.toggle("sorted", on);
      b.classList.toggle("desc", on && !sortAsc);
    });
  }

  /* --- Results --- */

  function cell(text) {
    var td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function rowFor(f) {
    var tr = document.createElement("tr");
    tr.dataset.href = f.url;

    var nameCell = document.createElement("td");
    nameCell.className = "find-name";
    var icon = document.createElement("span");
    icon.className = "icon " + (f.dir ? "icon-folder-16" : "icon-document-16");
    icon.setAttribute("aria-hidden", "true");
    var a = document.createElement("a");
    a.href = f.url;
    a.textContent = f.name;
    nameCell.appendChild(icon);
    nameCell.appendChild(a);

    tr.appendChild(nameCell);
    tr.appendChild(cell(f.folder));
    tr.appendChild(cell(f.size == null ? "" : f.size + "KB"));
    tr.appendChild(cell(f.type));
    tr.appendChild(cell(f.date));
    return tr;
  }

  function select(tr) {
    Array.prototype.slice.call(rowsEl.children).forEach(function (r) {
      r.classList.toggle("highlighted", r === tr);
    });
  }

  rowsEl.addEventListener("click", function (e) {
    var tr = e.target.closest("tr");
    if (!tr) return;
    select(tr);
    /* The anchor navigates on its own; a bare row click only selects,
       exactly like a single click in Explorer. */
  });

  rowsEl.addEventListener("dblclick", function (e) {
    var tr = e.target.closest("tr");
    if (!tr || !tr.dataset.href) return;
    /* Opening a result shouldn't close Find, or anything else on this
       desktop; main.js swaps the page under us. */
    if (window.MF && window.MF.open) window.MF.open(tr.dataset.href);
    else location.href = tr.dataset.href;
  });

  /* --- Running a search --- */

  var run = 0;
  var timer = null;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setBusy(on) {
    win.classList.toggle("searching", on);
    stopBtn.disabled = !on;
    nowBtn.disabled = on;
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* Win98 filled the list while it searched, and that trickle is half
     the charm - but it's theater over an in-memory array, so it's
     capped, interruptible with Stop, and skipped outright for anyone
     who asked for less motion. */
  function render(list, instant) {
    var mine = ++run;
    clearTimeout(timer);
    lastResults = list;
    resultsEl.hidden = false;
    rowsEl.textContent = "";
    emptyEl.hidden = list.length > 0;

    if (instant || reducedMotion() || list.length <= 3) {
      var frag = document.createDocumentFragment();
      list.forEach(function (f) { frag.appendChild(rowFor(f)); });
      rowsEl.appendChild(frag);
      done(list.length, false);
      return;
    }

    setBusy(true);
    var i = 0;
    var step = Math.max(1, Math.ceil(list.length / 8));
    (function chunk() {
      if (mine !== run) return;
      var end = Math.min(list.length, i + step);
      for (; i < end; i++) rowsEl.appendChild(rowFor(list[i]));
      setStatus(i + " file(s) found");
      if (i < list.length) {
        timer = setTimeout(chunk, 45);
        return;
      }
      done(list.length, false);
    })();
  }

  function done(count, stopped) {
    setBusy(false);
    setStatus((stopped ? "Search stopped. " : "") + count + " file(s) found");
    searched = true;
    window.MF.notify("find"); /* a search that found nothing is worth knowing */
  }

  function collect(scores) {
    var filters = [namedFilter(), scopeFilter(), dateFilter(), typeFilter(), sizeFilter()].filter(
      Boolean
    );
    var list = FILES.filter(function (f) {
      for (var i = 0; i < filters.length; i++) if (!filters[i](f)) return false;
      return scores ? scores[f.key] !== undefined : true;
    });
    /* Text search has an opinion about order; without one, the column
       sort applies. */
    if (scores) {
      return list.sort(function (a, b) {
        return scores[b.key] - scores[a.key];
      });
    }
    return sortList(list);
  }

  function retitle() {
    var q = namedEl.value.trim();
    var title = q ? "Find: Files named " + q : "Find: All Files";
    titleEl.textContent = title;
    if (taskLabel) taskLabel.textContent = title;
  }

  function search() {
    retitle();
    if (!FILES.length) {
      setStatus("Cannot read the file list on this page.");
      return;
    }
    var text = textEl.value.trim();
    if (!text) {
      render(collect(null));
      return;
    }
    setBusy(true);
    setStatus("Searching...");
    loadIndex().then(
      function (index) {
        setBusy(false);
        render(collect(textMatches(index, text)));
      },
      function () {
        setBusy(false);
        render(collect(null));
        setStatus("Full-text index unavailable \u2014 searched names only.");
      }
    );
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    search();
  });

  stopBtn.addEventListener("click", function () {
    run++;
    clearTimeout(timer);
    done(rowsEl.children.length, true);
  });

  newBtn.addEventListener("click", function () {
    run++;
    clearTimeout(timer);
    form.reset();
    sizeEl.disabled = true;
    sortKey = "name";
    sortAsc = true;
    markSortHeaders();
    lastResults = [];
    searched = false;
    rowsEl.textContent = "";
    resultsEl.hidden = true;
    setBusy(false);
    retitle();
    setStatus("Ready");
    namedEl.focus();
  });

  sizeOpEl.addEventListener("change", function () {
    sizeEl.disabled = !sizeOpEl.value;
  });

  /* Typing in a date/period field is a clear vote for that radio. */
  [
    [fromEl, "find-when-between"],
    [toEl, "find-when-between"],
    [monthsEl, "find-when-months"],
    [daysEl, "find-when-days"],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      document.getElementById(pair[1]).checked = true;
    });
  });

  /* --- Tabs --- */

  var tabs = Array.prototype.slice.call(win.querySelectorAll('[role="tab"]'));

  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      selectTab(tab);
    });
    tab.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(tab);
      var next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      selectTab(next);
      next.focus();
    });
  });

  /* --- Window lifecycle --- */

  win.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    /* Reuse the title bar's Close button so main.js keeps ownership of
       taskbar state and focus fallback. */
    win.querySelector('[aria-label="Close"]').click();
  });

  /* A string is a file name, the way the Start menu and F3 ask. An
     object can also fill in "Containing text" and run the search, which
     is how the Assistant hands over a phrase someone highlighted on the
     page - that one wants the full-text index, not a filename glob. */
  function open(query) {
    win.classList.remove("closed");
    win.classList.remove("minimized");
    var b = window.MF.btnFor("find");
    if (b) b.hidden = false;
    window.MF.activate("find");
    var named = typeof query === "string" ? query : (query && query.named) || "";
    var text = (query && typeof query === "object" && query.text) || "";
    if (named) namedEl.value = named;
    if (text) {
      textEl.value = text;
      searched = false;
      search();
      textEl.focus();
      textEl.select();
      return;
    }
    namedEl.focus();
    namedEl.select();
  }

  /* What Find will tell anyone who asks (main.js's app registry). */
  window.MF.register("find", {
    content: function () {
      return {
        named: namedEl.value.trim(),
        text: textEl.value.trim(),
        /* null until a search has actually been run: "no results yet"
           and "no results" are different answers. */
        results: searched ? lastResults.length : null,
      };
    },
  });

  markSortHeaders();

  window.MFFind = { open: open };
})();

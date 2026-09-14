/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [81]. Do not reorder: these
   run in document order and several set shared globals. */
/* ============================================================
   THE QUANT CURRICULUM — the ordered path
   368 lessons over 53 stages, all open from the start. The order
   is a recommendation rather than a gate, and a lesson is passed
   by producing the answers rather than by having read the page.

   The loop each lesson runs is the one Volume 00 prescribes:
   interleaved review of what is due first, then a written attempt
   before any answer is revealed, then an objective check. Items you
   miss come back inside the same session rather than ending it.
   ============================================================ */
(function () {
  "use strict";

  var SP  = window.__SPINE__ || { L: [], S: [], Q: [] };
  var LES = SP.L || [], STG = SP.S || [];
  var QM  = {}; (SP.Q || []).forEach(function (q) { QM[q.id] = q; });
  var CM  = {};
  (window.__CARDS__ || []).forEach(function (c) { CM[c.i] = c; });
  (window.__NEWCARDS__ || []).forEach(function (c) { if (!CM[c.i]) CM[c.i] = c; });

  var KEY = "qc.path.v2", STUDYKEY = "qr-study-v1";
  var DAY = 86400000, N = LES.length;
  var REVIEW_CAP = 8;              /* due cards folded into one lesson */

  /* ---------- helpers ---------- */
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function today() { return Math.floor(Date.now() / DAY); }
  function dayKey(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---------- state ---------- */
  function blank() {
    return {
      v: 2, started: Date.now(),
      done: {}, tested: {}, read: {}, sum: {},
      mcq: {}, drill: {}, err: {},
      miss: [], conf: [],
      mode: "path", screen: "map", cur: 1, openStage: -1, run: null,
      days: {},
      set: { attempt: true, confidence: true, goal: 1, cap: 90 }
    };
  }
  var P = (function () {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem("qc.path.v1");
      if (raw) {
        var o = JSON.parse(raw), b = blank(), k;
        for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) b[k] = o[k];
        b.set = Object.assign(blank().set, o.set || {});
        if (!b.miss) b.miss = [];
        if (!b.conf) b.conf = [];
        if (!b.err) b.err = {};
        return b;
      }
    } catch (e) {}
    return blank();
  })();
  /* A local file can land on an opaque origin where localStorage throws. The old
     code swallowed that and lost every lesson silently; now it says so. */
  var STORE_OK = true;
  function showStoreWarn(on) {
    var w = document.getElementById("qc-store-warn");
    if (!w) return;
    if (on) w.innerHTML = "<b>Progress is not being saved.</b> This copy of the file cannot " +
      "store data. Use <b>Progress and settings \u2192 Export</b> before you close it.";
    w.classList.toggle("on", !!on);
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(P));
      if (!STORE_OK) { STORE_OK = true; showStoreWarn(false); }
    } catch (e) {
      if (STORE_OK) { STORE_OK = false; showStoreWarn(true); }
    }
  }

  function isDone(n) { return !!P.done[n]; }
  function unlocked(n) { return true; }   /* every lesson is open; the order is a recommendation */
  function nextN() { for (var i = 1; i <= N; i++) if (!isDone(i)) return i; return N; }
  /* Where you actually are, now that the path is not gated. nextN() is the EARLIEST
     unpassed lesson, which for anyone reading out of order is lesson 1 forever — using
     it as the resume pointer snaps you back to the start every time you pass something. */
  function nextAfter(n) { var i; for (i = (n | 0) + 1; i <= N; i++) if (!isDone(i)) return i; return nextN(); }
  function resumeN() {
    var c = P.cur | 0;
    if (!(c >= 1 && c <= N)) return nextN();
    return isDone(c) ? nextAfter(c) : c;
  }
  function doneCount() { var c = 0, i; for (i = 1; i <= N; i++) if (isDone(i)) c++; return c; }
  function lesson(n) { return LES[n - 1]; }
  function stageOf(n) { return STG[lesson(n).st]; }
  function stageDone(si) { var c = 0; STG[si].ls.forEach(function (i) { if (isDone(i + 1)) c++; }); return c; }
  function minsLeft() { var m = 0, i; for (i = 1; i <= N; i++) if (!isDone(i)) m += lesson(i).m; return m; }

  function todayRec() {
    var k = dayKey();
    if (!P.days[k]) P.days[k] = { lessons: 0, reviews: 0, items: 0, mins: 0 };
    return P.days[k];
  }
  function streak() {
    var n = 0, d = new Date();
    for (var i = 0; i < 400; i++) {
      var k = dayKey(d);
      if (P.days[k] && (P.days[k].items || P.days[k].lessons)) n++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------- the shared card scheduler ---------- */
  function studyState() {
    try { return window.__STUDY__ && window.__STUDY__.state ? window.__STUDY__.state() : null; } catch (e) { return null; }
  }
  function studyWrite(st) { try { localStorage.setItem(STUDYKEY, JSON.stringify(st)); } catch (e) {} }
  function markSectionUnderstood(sid) {
    var st = studyState(); if (!st) return;
    if (!st.done) st.done = {};
    st.done[sid] = today(); studyWrite(st);
  }
  function gradeCardThrough(id, grade) {
    var S = window.__STUDY__, st = studyState();
    if (!S || !S.schedule || !st) return;
    if (!st.cards) st.cards = {};
    st.cards[id] = S.schedule(st.cards[id], grade);
    if (!st.log) st.log = [];
    var t = today(), last = st.log[st.log.length - 1];
    if (last && last[0] === t) { last[1]++; if (grade > 0) last[2]++; }
    else st.log.push([t, 1, grade > 0 ? 1 : 0]);
    studyWrite(st);
  }
  /* card id -> the lesson that teaches it */
  var CARD_OWNER = {};
  LES.forEach(function (L) { (L.c || []).forEach(function (id) { CARD_OWNER[id] = L.n; }); });

  function dueCards(limit) {
    var st = studyState(); if (!st || !st.cards) return [];
    var t = today(), out = [];
    Object.keys(st.cards).forEach(function (id) {
      var own = CARD_OWNER[id];
      if (!own || !isDone(own)) return;         /* only maintain what you have passed */
      if (!CM[id]) return;
      var r = st.cards[id];
      if (r && r.d <= t) out.push({ id: id, n: own, over: t - r.d });
    });
    out.sort(function (a, b) { return b.over - a.over; });
    out = out.slice(0, Math.max(limit * 3, limit));
    shuffle(out);                                /* interleave across volumes */
    return out.slice(0, limit);
  }
  function dueCount() {
    var st = studyState(); if (!st || !st.cards) return 0;
    var t = today(), c = 0;
    Object.keys(st.cards).forEach(function (id) {
      var own = CARD_OWNER[id];
      if (own && isDone(own) && CM[id] && st.cards[id].d <= t) c++;
    });
    return c;
  }

  function logMiss(n, kind, id, conf) {
    P.miss.unshift({ t: Date.now(), n: n, k: kind, id: id, c: conf == null ? null : conf });
    if (P.miss.length > 300) P.miss.length = 300;
    P.err[n] = (P.err[n] || 0) + 1;
  }
  function logConf(conf, ok) {
    if (conf == null) return;
    P.conf.push([conf, ok ? 1 : 0]);
    if (P.conf.length > 2000) P.conf = P.conf.slice(-1500);
  }
  function calibration() {
    if (P.conf.length < 8) return null;
    var brier = 0, mc = 0, ma = 0;
    P.conf.forEach(function (x) { brier += (x[0] - x[1]) * (x[0] - x[1]); mc += x[0]; ma += x[1]; });
    var n = P.conf.length;
    return { n: n, brier: brier / n, gap: mc / n - ma / n, acc: ma / n };
  }

  /* ============================================================
     MODES
     ============================================================ */
  var VIEWS = { path: "qc-root", ref: "qr-root", trn: "tr-root" };
  function setMode(m, quiet) {
    if (!VIEWS[m]) m = "path";
    P.mode = m; window.__QC_MODE__ = m; save();
    Object.keys(VIEWS).forEach(function (k) {
      var v = document.getElementById(VIEWS[k]);
      if (v) v.classList.toggle("on", k === m);
    });
    $$("#qc-bar button[data-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    });
    if (m !== "ref") hideReturn();
    if (!quiet) window.scrollTo(0, 0);
    ensureVisible(false);      /* cheap structural check, right now */
    watchdog();                /* and a patient one once the view has had time to draw */
  }

  var SESS_START = Date.now(), SESS_FLUSHED = 0;
  function sessMins() { return (Date.now() - SESS_START) / 60000; }

  function buildBar() {
    var bar = el("div"); bar.id = "qc-bar";
    bar.innerHTML =
      '<button type="button" data-mode="path">Path</button>' +
      '<button type="button" data-mode="ref">Reference</button>' +
      '<button type="button" data-mode="trn">Trainer</button>' +
      '<span class="qc-barprog" id="qc-barprog"></span>';
    document.body.appendChild(bar);
    var warn = el("div"); warn.id = "qc-store-warn"; document.body.appendChild(warn);
    var sizeBar = function () {
      var h = bar.offsetHeight;
      if (h) document.documentElement.style.setProperty("--qc-bar-h", h + "px");
    };
    sizeBar();
    window.addEventListener("resize", sizeBar);
    window.addEventListener("orientationchange", function () { setTimeout(sizeBar, 250); });
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (!b) return;
      setMode(b.dataset.mode);
      if (b.dataset.mode === "path") render();
    });
    var ret = el("div"); ret.id = "qc-ret";
    ret.innerHTML = '<span class="t"></span><button type="button" id="qc-retb">Back to the lesson</button>';
    document.body.appendChild(ret);
    $("#qc-retb").addEventListener("click", function () { hideReturn(); setMode("path"); render(); });
    setInterval(updateBar, 30000);
  }
  function updateBar() {
    var b = document.getElementById("qc-barprog");
    if (!b) return;
    var d = dueCount(), m = Math.round(sessMins());
    b.innerHTML = "<b>" + doneCount() + "</b> / " + N +
      (d ? ' · <b class="due">' + d + "</b> due" : "") +
      (m >= 5 ? " · " + m + "m" : "");
  }
  function showReturn(n) {
    var r = document.getElementById("qc-ret"); if (!r) return;
    var L = lesson(n);
    $(".t", r).textContent = "Lesson " + n + " — " + (L.num ? L.num + " " : "") + L.t;
    r.classList.add("on");
  }
  function hideReturn() { var r = document.getElementById("qc-ret"); if (r) r.classList.remove("on"); }

  /* ============================================================
     VEIL + SEARCH GATE
     ============================================================ */
  var VEIL = null;
  /* Nothing is gated any more, so the veil has nothing to hide. It used to
     touch ~2,400 Reference nodes on EVERY render and insert 368 stub divs;
     on a phone that is pure cost, and it defeats the section containment. */
  var GATED = false;
  function buildVeil() {
    if (!GATED) { VEIL = null; return; }
    VEIL = {};
    var root = document.getElementById("qr-root"); if (!root) return;
    var bySid = {}; LES.forEach(function (L) { bySid[L.s] = L.n; });
    /* Every lesson is its own <article class="lesson"> now, so the run of
       nodes a lesson owns is simply that article's children after the
       heading -- no sibling walking, and nothing to get out of step. */
    $$("article.lesson", root).forEach(function (a) {
      var h = a.querySelector("h3[id]"); if (!h) return;
      var n = bySid[h.id] || +a.dataset.lesson; if (!n) return;
      var nodes = $$(":scope > *", a).filter(function (x) { return x !== h; });
      var stub = el("div", "qc-lockstub"); stub.style.display = "none";
      a.insertBefore(stub, h.nextSibling);
      VEIL[n] = { h: h, nodes: nodes, stub: stub };
    });
  }
  function applyVeil() {
    if (!GATED || !VEIL) return;
    Object.keys(VEIL).forEach(function (k) {
      var n = +k, v = VEIL[n], open = unlocked(n);
      v.nodes.forEach(function (x) { x.classList.toggle("qc-veiled", !open); });
      v.stub.style.display = open ? "none" : "";
      if (!open && !v.stub.dataset.filled) {
        v.stub.dataset.filled = "1";
        v.stub.innerHTML =
          "<b>Locked — lesson " + n + " of " + N + ".</b> " +
          "This section opens once lesson " + (n - 1) + " is passed. Any unlocked lesson can be " +
          "passed without reading it, and a whole stage can be cleared by exam from the path." +
          '<br><button type="button" data-goto="' + (n - 1) + '">Go to lesson ' + (n - 1) + "</button>";
      }
    });
    applySearchGate();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-goto]") : null;
    if (!b) return;
    e.preventDefault(); openLesson(+b.dataset.goto);
  });

  var SIDX_ALL = null, SIDX_OWNER = null;
  function buildSearchGate() {
    if (!GATED) return;                 /* every entry is reachable; nothing to rewrite */
    var arr = window.__SEARCH_INDEX__;
    if (!Array.isArray(arr)) return;
    SIDX_ALL = arr.slice();
    var bySid = {}; LES.forEach(function (L) { bySid[L.s] = L.n; });
    function nlab(s) {
      return String(s || "").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim()
        .replace(/^Vol\s+0*(\d)/, "Vol $1");
    }
    var byLab = {}, bySecId = {};
    STG.forEach(function (S) {
      if (S.lab) byLab[nlab(S.lab)] = S.ls[0] + 1;
      if (S.sid) bySecId[S.sid] = S.ls[0] + 1;
    });
    SIDX_OWNER = SIDX_ALL.map(function (e) {
      if (bySid[e.id]) return bySid[e.id];
      if (bySecId[e.id]) return bySecId[e.id];
      var node = document.getElementById(e.id);
      if (!node) return byLab[nlab(e.v)] || 0;
      /* the owning lesson is now an ancestor, so ask for it directly */
      var art = node.closest ? node.closest("article.lesson") : null;
      if (art) {
        var own = +art.dataset.lesson;
        if (own) return own;
        var ah = art.querySelector("h3[id]");
        if (ah && bySid[ah.id]) return bySid[ah.id];
      }
      return byLab[nlab(e.v)] || 0;
    });
  }
  function applySearchGate() {
    if (!GATED || !SIDX_ALL) return;
    var arr = window.__SEARCH_INDEX__, out = [], i, e, own;
    for (i = 0; i < SIDX_ALL.length; i++) {
      e = SIDX_ALL[i]; own = SIDX_OWNER[i];
      if (!own || unlocked(own)) out.push(e);
      else out.push({ id: e.id, t: e.t, v: e.v, s: e.s,
        x: "Locked — lesson " + own + " of " + N + ", which opens once lesson " + (own - 1) + " is passed." });
    }
    arr.length = 0; Array.prototype.push.apply(arr, out);
  }

  /* ============================================================
     RENDER
     ============================================================ */
  var root, main;

  /* ============================================================
     NEVER-BLANK WATCHDOG
     Only one of the three view roots carries .on; the rest are
     display:none. If a view fails to draw — or none is marked on —
     the whole page is white, and because P.mode is saved that state
     survives relaunching the file. This puts the path back.
     ============================================================ */
  var WD = null;
  function activeRoot() {
    var m = window.__QC_MODE__ || P.mode || "path";
    return document.getElementById(VIEWS[m] || "qc-root");
  }
  function rescueToPath() {
    RUN = null; REV = null; EX = null;
    P.mode = "path"; P.screen = "map"; P.run = null; save();
    setMode("path", true);
    render();
  }
  function viewBlank(r) {
    if (!r) return true;
    if (getComputedStyle(r).display === "none") return true;
    if ((window.__QC_MODE__ || P.mode) === "path") return !main || !main.firstElementChild;
    return r.childElementCount < 1;                  /* the view drew nothing */
  }
  function ensureVisible(patient) {
    try {
      var ids = ["qc-root", "qr-root", "tr-root"], on = 0, i, v;
      for (i = 0; i < ids.length; i++) {
        v = document.getElementById(ids[i]);
        if (v && v.classList.contains("on")) on++;
      }
      if (on !== 1) { rescueToPath(); return; }        /* structural: never legitimate */
      if (!patient) return;
      if (viewBlank(activeRoot())) rescueToPath();
    } catch (e) { try { recover(e, "while checking the screen"); } catch (e2) {} }
  }
  function watchdog(ms) {
    if (WD) clearTimeout(WD);
    WD = setTimeout(function () { ensureVisible(true); }, ms || 2500);
  }

  function recover(err, where) {
    try {
      RUN = null; REV = null; EX = null;
      P.screen = "map"; P.run = null; save();
      if (main) main.innerHTML =
        '<div class="qc-wrap"><div class="qc-panel hi"><h2 style="margin-top:0">That screen could not be drawn</h2>' +
        "<p>The path has been returned to a working state and your progress is intact. " +
        "If this keeps happening, the detail below is the useful part.</p>" +
        '<p class="qc-note"><b>' + esc(where) + ":</b> " + esc(String(err && err.message || err)) + "</p>" +
        '<div class="qc-row"><button type="button" class="qc-btn pri" data-act="map">The path</button>' +
        '<button type="button" class="qc-btn ghost" data-act="stats">Progress and settings</button></div></div></div>';
      renderSide();
    } catch (e2) {
      if (main) main.innerHTML = '<div class="qc-wrap"><p>Something went wrong. Reopen the file to continue.</p></div>';
    }
  }

  function render() {
    try {
      updateBar(); applyVeil();
      /* A live run owns the screen; P.cur is only the resume pointer. */
      if (P.screen === "lesson") renderLesson(RUN ? RUN.n : P.cur);
      else if (P.screen === "stats") renderStats();
      else if (P.screen === "review") renderReview();
      else if (P.screen === "exam") renderExam();
      else renderMap();
      renderSide();
      watchdog();
    } catch (err) { recover(err, "while drawing " + P.screen); }
  }

  function renderSide() {
    var s = $(".qc-stagelist", root); if (!s) return;
    var cur = resumeN(), curStage = lesson(cur).st;
    s.innerHTML = STG.map(function (st, i) {
      var d = stageDone(i), t = st.ls.length;
      var lock = !unlocked(st.ls[0] + 1) && d === 0;
      return '<button type="button" class="qc-stage-b' + (i === curStage ? " cur" : "") +
        (d === t ? " full" : "") + (lock ? " lock" : "") + '" data-stage="' + i + '">' +
        '<span class="v">' + esc((st.lab || "").replace(/^Vol\s*/, "") || "—") + "</span>" +
        '<span class="n">' + esc(st.t) + "</span>" +
        '<span class="c">' + d + "/" + t + "</span></button>";
    }).join("");
    var pct = N ? doneCount() / N * 100 : 0;
    $(".qc-meter i", root).style.width = pct.toFixed(1) + "%";
    $(".qc-sub", root).innerHTML =
      doneCount() + " of " + N + " · " + Math.round(pct) + "% · " + Math.round(minsLeft() / 60) + " h left";
  }

  function stat(v, k, cls) { return '<div class="qc-stat ' + (cls || "") + '"><b>' + v + "</b><span>" + k + "</span></div>"; }
  function ring(f) {
    var r = 11, c = 2 * Math.PI * r, off = c * (1 - f);
    return '<svg class="qc-ring' + (f >= 1 ? " full" : "") + '" viewBox="0 0 26 26" aria-hidden="true">' +
      '<circle class="bg" cx="13" cy="13" r="' + r + '"></circle>' +
      '<circle class="fg" cx="13" cy="13" r="' + r + '" stroke-dasharray="' + c.toFixed(2) +
      '" stroke-dashoffset="' + off.toFixed(2) + '"></circle></svg>';
  }

  /* ---------- the map ---------- */
  function renderMap() {
    var cur = resumeN(), L = lesson(cur), st = stageOf(cur), all = doneCount() === N;
    if (P.openStage < 0) P.openStage = L.st;
    var due = dueCount(), td = todayRec(), h = [];

    h.push('<div class="qc-wrap">');
    h.push('<p class="qc-eyebrow">The path</p>');
    h.push("<h1>Everything, in order</h1>");
    h.push('<p class="qc-lede">' + N + " lessons across " + STG.length +
      " stages. Each is a section of the reference with an objective, a written recall check and an " +
      "objective check. Every lesson is open — the order is a recommendation, not a gate — and a " +
      "lesson is passed by producing the answers, never by having read the page.</p>");

    h.push('<div class="qc-stats">');
    h.push(stat(doneCount() + " / " + N, "lessons passed"));
    h.push(stat(due, "cards due now", due ? "warn" : ""));
    h.push(stat(Math.round(minsLeft() / 60) + " h", "of work remaining"));
    h.push(stat(streak(), "day streak"));
    h.push("</div>");

    /* today */
    var capHit = sessMins() >= (P.set.cap || 90);
    h.push('<div class="qc-today">' +
      "<b>Today</b> " + plural(td.lessons, "lesson") + " · " + td.reviews + " reviews · " +
      Math.round(td.mins + sessMins()) + " min" +
      (P.set.goal ? " · goal " + plural(P.set.goal, "lesson") + " plus the due queue" : "") +
      (capHit ? ' <span class="qc-tag warn">session cap reached — stop</span>' : "") + "</div>");

    h.push('<div class="qc-row">');
    if (due) h.push('<button type="button" class="qc-btn pri" data-act="review">Review ' + due + " due first</button>");
    h.push('<button type="button" class="qc-btn' + (due ? "" : " pri") + '" data-act="cur">' +
      (all ? "Revisit lesson " + cur : (doneCount() || cur > 1) ? "Continue — lesson " + cur : "Start — lesson 1") + "</button>");
    h.push('<button type="button" class="qc-btn ghost" data-act="stats">Progress and settings</button>');
    h.push("</div>");

    if (all) {
      h.push('<div class="qc-pass"><h2>All ' + N + ' passed</h2>' +
        "<p>Every section is open, and each was cleared by producing the answer rather than by reading it. " +
        "What remains is the part a path cannot do for you: the cards keep coming due, the trainer keeps " +
        "generating problems that cannot be memorised, and Volume 26 is a workbench rather than a chapter.</p></div>");
    } else {
      h.push('<p class="qc-note"><b>Up next.</b> ' + esc((L.num ? L.num + " " : "") + L.t) +
        " — " + esc(st.t) + ". " + esc(L.o) + "</p>");
    }

    h.push("<h2>How this file is put together</h2>");
    h.push('<p class="qc-note"><b>The Path</b> is this screen: every section of the reference as a numbered ' +
      "lesson with an objective, retrieval cards and an objective check, ordered along the spine first \u2014 " +
      "the shortest walk that ends with a strategy you can run \u2014 and then by branch. <b>The Reference</b> is the full text — " + STG.filter(function (x) { return /^Vol /.test(x.lab || ""); }).length + " volumes, " +
      LES.length + " sections, " + (window.__CARDS__ ? window.__CARDS__.length : 392) + " cards, " +
      (window.__GLOSS__ ? Object.keys(window.__GLOSS__).length : 227) + " " +
      "glossary terms, sixteen calculators and a strategy laboratory — all of it open from the " +
      "start. <b>The Trainer</b> is 1,092 generated problems across eleven kinds on its own schedule; the path " +
      "borrows from it wherever a lesson has drills. Nothing is transmitted; it is all in this browser.</p>");
    h.push('<p class="qc-note" style="margin-top:10px"><b>The loop.</b> Each lesson opens with whatever is ' +
      "due from earlier lessons, interleaved across volumes — that is the spacing the rest depends on. Then a " +
      "written attempt before any answer is shown, then multiple choice where all four options are the same " +
      "length so nothing can be guessed from shape, then one line in your own words. Anything you miss " +
      "returns later in the same session rather than ending it, and is counted.</p>");

    h.push("<h2>The stages</h2>");
    STG.forEach(function (S, i) {
      var d = stageDone(i), t = S.ls.length, open = i === P.openStage;
      var first = S.ls[0] + 1, reachable = unlocked(first) || d > 0;
      h.push('<div class="qc-stagecard' + (open ? " open" : "") + (i === L.st ? " cur" : "") + '">');
      h.push('<div class="qc-stagehead" data-stage="' + i + '">');
      h.push(ring(t ? d / t : 0));
      h.push('<span class="vl">' + esc(S.lab || "—") + "</span>");
      h.push('<span class="ti">' + esc(S.t) + "</span>");
      h.push('<span class="ct">' + d + " / " + t + (reachable ? "" : " · locked") + "</span>");
      h.push("</div>");
      h.push('<div class="qc-lessons">');
      if (S.dep && S.dep.length) {
        h.push('<div class="qc-lrow" style="cursor:default;color:var(--ink-3)">' +
          '<span class="ix">↳</span><span class="nm"><em>Leans on ' +
          S.dep.map(function (si) {
            return esc((STG[si].lab && STG[si].lab !== "—" ? STG[si].lab + " · " : "") + STG[si].t);
          }).join("; ") + "</em></span></div>");
      }
      if (d < t && reachable && examPool(i).length >= 6) {
        h.push('<button type="button" class="qc-lrow" data-exam="' + i + '">' +
          '<span class="ix">—</span><span class="nm"><em>Test out of this whole stage — ' +
          Math.min(20, examPool(i).length) + " questions, 90% to pass</em></span>" +
          '<span class="st">exam</span></button>');
      }
      S.ls.forEach(function (idx) {
        var n = idx + 1, Ls = LES[idx];
        var cls = isDone(n) ? "done" : (n === cur ? "next" : (unlocked(n) ? "" : "lock"));
        var lab = isDone(n) ? (P.tested[n] ? "tested" : (P.err[n] ? P.err[n] + " missed" : "passed"))
                            : (unlocked(n) ? "open" : "locked");
        h.push('<button type="button" class="qc-lrow ' + cls + '" data-lesson="' + n + '">' +
          '<span class="ix">' + n + "</span>" +
          '<span class="nm">' + (Ls.num ? "<em>" + esc(Ls.num) + "</em> " : "") + esc(Ls.t) + "</span>" +
          '<span class="st">' + lab + "</span></button>");
      });
      h.push("</div></div>");
    });
    h.push("</div>");
    main.innerHTML = h.join("");
  }

  /* ============================================================
     THE LESSON RUNNER
     ============================================================ */
  var RUN = null;

  function openLesson(n) {
    n = Math.round(+n);
    if (!isFinite(n) || n < 1) n = 1;   /* a bad pointer used to blank the screen */
    if (n > N) n = N;
    P.cur = unlocked(n) ? n : nextN();
    P.screen = "lesson"; RUN = null; save();
    setMode("path"); render();
  }

  function newRun(n) {
    var L = lesson(n);
    var cards = (L.c || []).filter(function (id) { return CM[id]; });
    var qs = (L.q || []).map(function (id) { return QM[id]; }).filter(Boolean);
    var R = {
      n: n,
      phase: isDone(n) ? "done" : "intro",
      rev: isDone(n) ? [] : dueCards(REVIEW_CAP),   /* interleaved maintenance */
      ri: 0, rshown: false, rattempt: "",
      cards: shuffle(cards.slice()), ci: 0, cshown: false, cattempt: "",
      qs: shuffle(qs.slice()), qi: 0, qsh: null, qconf: null,
      drill: P.drill[n] || null,
      summary: P.sum[n] || "", errs: 0, skipRead: false
    };
    return restoreRun(R, n);
  }

  /* iOS discards backgrounded web views. Without a snapshot, switching apps
     during a lesson drops you back at the intro with the answers re-shuffled. */
  function snapRun() {
    var R = RUN;
    if (!R) return;
    try {
      P.run = {
        n: R.n, phase: R.phase, ri: R.ri | 0, ci: R.ci | 0, qi: R.qi | 0, errs: R.errs | 0,
        rshown: !!R.rshown, cshown: !!R.cshown,
        rattempt: R.rattempt || "", cattempt: R.cattempt || "",
        summary: R.summary || "", skipRead: !!R.skipRead,
        qconf: R.qconf == null ? null : R.qconf,
        qsh: R.qsh ? { qi: R.qsh.qi, order: R.qsh.order.slice(), picked: R.qsh.picked } : null,
        cards: R.cards.slice(),
        qs: R.qs.map(function (q) { return q && q.id; }),
        rev: R.rev.map(function (it) { return { id: it.id, n: it.n, over: it.over }; }),
        drill: R.drill || null
      };
    } catch (e) { P.run = null; }
  }
  function restoreRun(R, n) {
    var s = P.run;
    if (!s || s.n !== n) return R;
    try {
      var cards = (s.cards || []).filter(function (id) { return CM[id]; });
      var qs = (s.qs || []).map(function (id) { return QM[id]; }).filter(Boolean);
      var rev = (s.rev || []).filter(function (it) { return it && CM[it.id]; });
      if (cards.length) R.cards = cards;
      if (qs.length) R.qs = qs;
      R.rev = rev;
      /* If not actually at gate, do not let an old stuck state jump to gate */
      if (s.phase === "gate" && (R.cards.length > 0 && (s.ci | 0) < R.cards.length)) {
        R.phase = "recall";
      } else if (s.phase === "gate" && (R.qs.length > 0 && (s.qi | 0) < R.qs.length)) {
        R.phase = "check";
      } else {
        R.phase = s.phase || R.phase;
      }
      R.ri = Math.min(s.ri | 0, R.rev.length);
      R.ci = Math.min(s.ci | 0, R.cards.length);
      R.qi = Math.min(s.qi | 0, R.qs.length);
      R.errs = s.errs | 0;
      R.rshown = !!s.rshown; R.cshown = !!s.cshown;
      R.rattempt = s.rattempt || ""; R.cattempt = s.cattempt || "";
      R.summary = s.summary || R.summary;
      R.skipRead = !!s.skipRead;
      R.qconf = s.qconf == null ? null : s.qconf;
      R.qsh = s.qsh && s.qsh.order ? { qi: s.qsh.qi, order: s.qsh.order.slice(), picked: s.qsh.picked } : null;
      if (s.drill) R.drill = s.drill;
      /* never restore into a step whose queue no longer exists */
      if (R.phase === "review" && R.ri >= R.rev.length) R.phase = R.cards.length ? "recall" : "check";
      if (R.phase === "recall" && R.ci >= R.cards.length) R.phase = "check";
      if (isDone(n)) R.phase = "done";
    } catch (e) {}
    return R;
  }

  function renderLesson(n) {
    var L = lesson(n), S = stageOf(n);
    if (!unlocked(n)) { P.screen = "map"; save(); return renderMap(); }
    if (!RUN || RUN.n !== n) RUN = newRun(n);
    var R = RUN, pool = L.p || 0, h = [];

    /* A phase that no longer matches what the lesson holds used to fall through
       every branch below and leave an empty panel with no way forward. */
    if (R.phase === "done" && !isDone(n)) R.phase = "gate";
    if (R.phase === "review" && R.ri >= R.rev.length) R.phase = R.cards.length ? "recall" : "check";
    if (R.phase === "recall" && (R.ci >= R.cards.length || !CM[R.cards[R.ci]])) R.phase = "check";
    if (!/^(done|intro|review|recall|check|gate)$/.test(R.phase)) R.phase = "intro";

    h.push('<div class="qc-wrap">');
    h.push('<p class="qc-crumb"><a data-act="map">The path</a> <span>›</span> ' +
      esc(S.lab || "—") + " · " + esc(S.t) + " <span>›</span> lesson " + n + " of " + N + "</p>");
    h.push("<h1>" + (L.num ? '<span class="qc-eyebrow" style="display:block;margin-bottom:6px">' +
      esc(L.num) + "</span>" : "") + esc(L.t) + "</h1>");
    h.push('<div class="qc-obj"><b>By the end you can</b>' + esc(L.o) + "</div>");

    var bits = ["~" + L.m + " min", plural(R.cards.length, "card"),
      R.qs.length ? plural(R.qs.length, "question") : null,
      pool ? plural(pool, "drill") : null];
    if (L.pre && L.pre.length) {
      bits.push("leans on " + L.pre.map(function (i) {
        return '<a data-act="jump" data-n="' + (i + 1) + '">' + esc(LES[i].num || LES[i].t) + "</a>";
      }).join(", "));
    } else if (S.dep && S.dep.length) {
      bits.push("this stage leans on " + S.dep.map(function (si) {
        return esc(STG[si].lab && STG[si].lab !== "—" ? STG[si].lab : STG[si].t);
      }).join(", "));
    }
    h.push('<p class="qc-meta">' + bits.filter(Boolean).map(function (b) { return "<span>" + b + "</span>"; }).join("") + "</p>");

    var revOK = R.ri >= R.rev.length;
    var readOK = !!P.read[n] || R.skipRead;
    var recallOK = R.ci >= R.cards.length;
    var checkOK = R.qi >= R.qs.length && (!pool || (R.drill && R.drill.pass));
    h.push('<div class="qc-steps">' +
      (R.rev.length ? step("0 Review", revOK, R.phase === "review") : "") +
      step("1 Read", readOK, R.phase === "read" || R.phase === "intro") +
      step("2 Recall", recallOK && R.phase !== "intro", R.phase === "recall") +
      step("3 Check", checkOK && R.phase !== "intro", R.phase === "check") +
      step("4 Gate", isDone(n), R.phase === "gate" || R.phase === "done") + "</div>");

    if (isDone(n) && R.phase === "done") {
      h.push('<div class="qc-pass"><h2>Passed' + (P.tested[n] ? " — by stage exam" : "") + "</h2>" +
        (P.sum[n] ? "<p><b>Your line:</b> " + esc(P.sum[n]) + "</p>" : "") +
        (P.err[n] ? '<p class="qc-note">' + plural(P.err[n], "item") + " missed on the way through; those " +
          "cards are scheduled to come back sooner.</p>" : "") +
        '<div class="qc-row">' +
        (n < N ? '<button type="button" class="qc-btn pri" data-act="next">Next — lesson ' + (n + 1) + "</button>" : "") +
        '<button type="button" class="qc-btn ghost" data-act="read">Re-read the section</button>' +
        '<button type="button" class="qc-btn ghost" data-act="redo">Run the checks again</button>' +
        '<button type="button" class="qc-btn ghost" data-act="map">The path</button>' +
        "</div></div>");
    }
    else if (R.phase === "intro") {
      if (R.rev.length) {
        h.push('<div class="qc-panel"><h2 style="margin-top:0">' + plural(R.rev.length, "card") + " due first</h2>" +
          "<p>Drawn from lessons you have already passed and shuffled across volumes. Reviewing before reading " +
          "is the ordering Volume 00.5 specifies, and skipping it is how the schedule collapses.</p></div>");
      }
      h.push('<div class="qc-panel hi"><h2 style="margin-top:0">Two ways through</h2>' +
        "<p>Read the section, then answer. Or go straight to the answers — the gate does not care how you got them.</p>" +
        '<div class="qc-row">' +
        '<button type="button" class="qc-btn pri" data-act="begin">' +
        (R.rev.length ? "Start with the review" : "Read the section") + "</button>" +
        '<button type="button" class="qc-btn" data-act="skip">Skip the reading — test out</button>' +
        "</div>" +
        '<p class="qc-note">The reference opens at this section. Come back with the strip at the foot of the screen.</p>' +
        "</div>");
    }
    else if (R.phase === "review") h.push(reviewHTML(R));
    else if (R.phase === "recall") h.push(recallHTML(R));
    else if (R.phase === "check")  h.push(checkHTML(R, pool, L));
    else if (R.phase === "gate")   h.push(gateHTML(R, L));

    if (!String(h[h.length - 1] || "").trim()) {   /* never leave an empty panel */
      R.phase = "gate";
      h.push(gateHTML(R, L));
    }

    h.push(keyHint(R));
    h.push("</div>");
    main.innerHTML = h.join("");

    var nx = $('.qc-pass [data-act="next"]', main);
    if (nx) nx.focus();

    var ta = $("#qc-sum", main);
    if (ta) ta.addEventListener("input", function () {
      RUN.summary = ta.value;
      var b = $('[data-act="finish"]', main);
      if (b) b.disabled = ta.value.trim().length < 12;
    });
    var at = $("#qc-att", main);
    if (at) { at.focus(); at.addEventListener("input", function () {
      var b = $('[data-act="reveal"]', main);
      if (b && P.set.attempt) b.disabled = false; /* Unlocked for iOS */
    }); }
    snapRun(); save();
  }
  function step(label, ok, on) {
    var p = label.split(" ");
    return '<div class="qc-step' + (on ? " on" : "") + (ok ? " ok" : "") + '"><b>' +
      esc(p.shift()) + "</b>" + esc(p.join(" ")) + "</div>";
  }
  function keyHint(R) {
    var k = R.phase === "check" ? "<kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>↵</kbd> next"
      : (R.phase === "recall" || R.phase === "review") ? "<kbd>↵</kbd> reveal · <kbd>1</kbd>–<kbd>4</kbd> grade"
      : "<kbd>↵</kbd> continue";
    return '<p class="qc-keys">' + k + " · <kbd>r</kbd> read the section · <kbd>esc</kbd> the path</p>";
  }

  /* ---------- step 0: interleaved review ---------- */
  function reviewHTML(R) {
    var it = R.rev[R.ri], c = CM[it.id];
    if (!c) { R.ri++; return ""; }
    var src = LES[it.n - 1];
    var h = ['<div class="qc-panel hi">'];
    h.push('<p class="qc-tick">Review ' + (R.ri + 1) + " of " + R.rev.length +
      ' · <span class="qc-from">from lesson ' + it.n + ", " + esc(src.num || src.t) + "</span>" +
      (it.over > 0 ? " · " + plural(it.over, "day") + " overdue" : "") + "</p>");
    h.push('<div class="qc-q">' + c.q + "</div>");
    if (!R.rshown) {
      h.push('<textarea id="qc-att" rows="2" autocapitalize="sentences" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="' +
        (P.set.attempt ? "Produce it before you look — this is the whole mechanism." :
         "Optional: say it in a line before you look.") + '"></textarea>');
      h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="reveal"' +
        (P.set.attempt ? " disabled" : "") + ">Reveal</button>" +
        '<button type="button" class="qc-btn ghost" data-act="blank">I could not produce it</button></div>');
    } else {
      if (R.rattempt) h.push('<div class="qc-att"><b>You wrote</b>' + esc(R.rattempt) + "</div>");
      h.push('<div class="qc-a">' + c.a + "</div>");
      h.push(grades());
    }
    h.push("</div>");
    return h.join("");
  }

  /* ---------- step 2: recall with a written attempt ---------- */
  function recallHTML(R) {
    var c = CM[R.cards[R.ci]];
    if (!c) return "";
    var h = ['<div class="qc-panel hi">'];
    h.push('<p class="qc-tick">Recall ' + (R.ci + 1) + " of " + R.cards.length +
      (R.errs ? " · " + plural(R.errs, "item") + " to come back" : "") + "</p>");
    h.push('<div class="qc-q">' + c.q + "</div>");
    if (!R.cshown) {
      h.push('<textarea id="qc-att" rows="3" autocapitalize="sentences" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="' +
        (P.set.attempt ? "Write it before you look. Producing it is what makes it stick — a rough line is enough."
                       : "Optional: say it in a line before you look.") + '"></textarea>');
      h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="reveal"' +
        ">Reveal the answer</button>" +
        '<button type="button" class="qc-btn ghost" data-act="blank">I could not produce it</button></div>');
    } else {
      if (R.cattempt) h.push('<div class="qc-att"><b>You wrote</b>' + esc(R.cattempt) + "</div>");
      h.push('<div class="qc-a">' + c.a + "</div>");
      h.push(grades());
      h.push('<p class="qc-note" style="margin-top:12px">Grade against what you produced <i>before</i> revealing. ' +
        "<b>Again</b> sends the card to the back of this queue — you will see it once more before the lesson ends.</p>");
    }
    h.push("</div>");
    return h.join("");
  }
  function grades() {
    return '<div class="qc-grades">' +
      '<button type="button" class="qc-btn" data-grade="0">Again</button>' +
      '<button type="button" class="qc-btn" data-grade="1">Hard</button>' +
      '<button type="button" class="qc-btn pri" data-grade="2">Good</button>' +
      '<button type="button" class="qc-btn" data-grade="3">Easy</button></div>';
  }

  /* ---------- step 3: the objective check ---------- */
  function checkHTML(R, pool, L) {
    var h = [];
    if (R.qi < R.qs.length) {
      var q = R.qs[R.qi];
      if (!R.qsh || R.qsh.qi !== R.qi) {
        R.qsh = { qi: R.qi, order: shuffle(q.o.map(function (t, i) { return i; })), picked: -1 };
        R.qconf = null;
      }
      var sh = R.qsh;
      h.push('<div class="qc-panel hi">');
      h.push('<p class="qc-tick">Question ' + (R.qi + 1) + " of " + R.qs.length +
        " · every one has to be right" + (R.errs ? " · " + plural(R.errs, "item") + " to come back" : "") + "</p>");
      h.push('<div class="qc-q">' + q.q + "</div>");
      if (P.set.confidence && sh.picked < 0 && R.qconf == null) {
        h.push('<div class="qc-conf"><span>Before you answer — how sure are you?</span>' +
          '<button type="button" class="qc-btn sm" data-conf="0.25">Guessing</button>' +
          '<button type="button" class="qc-btn sm" data-conf="0.6">Fairly sure</button>' +
          '<button type="button" class="qc-btn sm" data-conf="0.9">Certain</button></div>');
        h.push("</div>");
        return h.join("");
      }
      h.push('<div class="qc-opts">');
      sh.order.forEach(function (oi, k) {
        var cls = "qc-opt";
        if (sh.picked >= 0) {
          if (oi === q.c) cls += " right";
          else if (k === sh.picked) cls += " wrong";
        }
        h.push('<button type="button" class="' + cls + '" data-pick="' + k + '"' +
          (sh.picked >= 0 ? " disabled" : "") + '><kbd>' + (k + 1) + "</kbd><span>" + esc(q.o[oi]) + "</span></button>");
      });
      h.push("</div>");
      if (sh.picked >= 0) {
        var right = sh.order[sh.picked] === q.c;
        h.push('<div class="qc-why ' + (right ? "good" : "bad") + '"><b>' +
          (right ? "Right." : "No.") + "</b> " + q.w +
          (!right ? " <i>This one comes back before the lesson ends.</i>" : "") + "</div>");
        h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="qnext">' +
          (R.qi + 1 < R.qs.length ? "Next question" : "Done") + "</button>" +
          (!right ? '<button type="button" class="qc-btn ghost" data-act="read">Re-read the section</button>' : "") +
          "</div>");
      }
      h.push("</div>");
      return h.join("");
    }
    if (pool) {
      var need = Math.min(8, Math.max(4, Math.round(pool / 2)));
      h.push('<div class="qc-panel hi"><h2 style="margin-top:0">Drills for this section</h2>');
      h.push("<p>" + plural(pool, "generated item") + (pool === 1 ? " is" : " are") + " tagged to " +
        esc(L.num || L.t) + " — calculations, judgements, derivations, labs. The trainer runs <b>" +
        need + "</b> of them; <b>70%</b> passes.</p>");
      if (R.drill) {
        var pct = R.drill.n ? Math.round(R.drill.ok / R.drill.n * 100) : 0;
        h.push('<div class="qc-why ' + (R.drill.pass ? "good" : "bad") + '"><b>' +
          R.drill.ok + " of " + R.drill.n + " — " + pct + "%.</b> " +
          (R.drill.pass ? "That clears the drill bar." : "Below 70%. Run them again when you are ready.") + "</div>");
      }
      h.push('<div class="qc-row">' +
        '<button type="button" class="qc-btn pri" data-act="drill" data-need="' + need + '">' +
        (R.drill ? "Run them again" : "Run the drills") + "</button>" +
        (R.drill && R.drill.pass ? '<button type="button" class="qc-btn" data-act="togate">Continue</button>' : "") +
        "</div>");
      h.push('<p class="qc-note">This hands over to the Trainer and comes straight back with the score.</p></div>');
      return h.join("");
    }
    R.phase = "gate";
    return gateHTML(R, L);
  }

  /* ---------- step 4: the gate ---------- */
  function gateHTML(R, L) {
    var h = ['<div class="qc-panel hi"><h2 style="margin-top:0">One line, then the gate</h2>'];
    h.push("<p>Close everything and write what this section actually claimed, in your own words, in one sentence. " +
      "Producing it is the last retrieval act of the lesson, and the one that makes the rest hold.</p>");
    h.push('<textarea id="qc-sum" rows="3" autocapitalize="sentences" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="In one sentence: what does ' +
      esc(L.num || L.t) + ' claim, and why does it matter?">' + esc(R.summary || "") + "</textarea>");
    if (R.errs) h.push('<p class="qc-note" style="margin-top:10px">' + plural(R.errs, "item") +
      " came back during this lesson. Those cards are scheduled sooner, and the lesson is marked accordingly.</p>");
    h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="finish"' +
      ((R.summary || "").trim().length < 12 ? " disabled" : "") + ">Pass this lesson</button>" +
      '<button type="button" class="qc-btn ghost" data-act="map">Save and leave</button></div>');
    h.push("</div>");
    return h.join("");
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function advanceFromIntro(R) {
    R.phase = R.rev.length ? "review" : (R.cards.length ? "recall" : "check");
  }
  function afterReview(R) { R.phase = R.cards.length ? "recall" : "check"; }

  function actLesson(e) {
    var R = RUN, n = R ? R.n : P.cur, L = lesson(n);
    var b = e.target.closest("[data-act]");
    if (b) {
      var a = b.dataset.act;
      if (a === "map")    { P.screen = "map"; save(); render(); return; }
      if (a === "stats")  { P.screen = "stats"; save(); render(); return; }
      if (a === "review") { startReview(); return; }
      if (a === "cur")    { openLesson(resumeN()); return; }
      if (a === "jump")   { openLesson(+b.dataset.n); return; }
      if (a === "next")   { openLesson(n + 1); return; }
      if (a === "redo")   { RUN = newRun(n); RUN.phase = RUN.cards.length ? "recall" : "check"; renderLesson(n); return; }
      if (a === "begin")  {
        if (R.rev.length) { R.phase = "review"; renderLesson(n); }
        else { P.read[n] = 1; save(); advanceFromIntro(R); gotoSection(L.s, n); }
        return;
      }
      if (a === "skip")   {
        /* Testing out means answering without reading — not passing without
           answering. Mark the read step satisfied and drop into the same queue
           the reading path feeds: review first if any are due, then recall,
           then the check. The gate is still earned at the end. */
        R.skipRead = true;
        advanceFromIntro(R);
        save(); renderLesson(n);
        return;
      }
      if (a === "read")   {
        P.read[n] = 1; save();
        if (R.phase === "intro") advanceFromIntro(R);
        gotoSection(L.s, n); return;
      }
      if (a === "reveal") {
        var ta = $("#qc-att", main), v = ta ? ta.value.trim() : "";
        if (R.phase === "review") { R.rattempt = v; R.rshown = true; }
        else { R.cattempt = v; R.cshown = true; }
        renderLesson(n); return;
      }
      if (a === "blank")  {
        if (R.phase === "review") { R.rattempt = ""; R.rshown = true; }
        else { R.cattempt = ""; R.cshown = true; }
        renderLesson(n);
        var g = $('[data-grade="0"]', main); if (g) g.focus();
        return;
      }
      if (a === "qnext")  { stepQuestion(R, n); return; }
      if (a === "drill")  { runDrills(n, +b.dataset.need); return; }
      if (a === "togate") { R.phase = "gate"; renderLesson(n); return; }
      if (a === "finish") { finish(n); return; }
    }
    var cf = e.target.closest("[data-conf]");
    if (cf && R && R.phase === "check") { R.qconf = parseFloat(cf.dataset.conf); renderLesson(n); return; }

    var g = e.target.closest("[data-grade]");
    if (g && R && (R.phase === "recall" || R.phase === "review")) {
      var grade = +g.dataset.grade;
      if (R.phase === "review") {
        var it = R.rev[R.ri];
        gradeCardThrough(it.id, grade);
        todayRec().reviews++; todayRec().items++;
        if (grade === 0) { R.rev.push(it); R.errs++; logMiss(it.n, "c", it.id, null); }
        R.ri++; R.rshown = false; R.rattempt = "";
        if (R.ri >= R.rev.length) afterReview(R);
        save(); renderLesson(n); return;
      }
      var id = R.cards[R.ci];
      gradeCardThrough(id, grade);
      todayRec().items++;
      if (grade === 0) { R.cards.push(id); R.errs++; logMiss(n, "c", id, null); }
      R.ci++; R.cshown = false; R.cattempt = "";
      if (R.ci >= R.cards.length) R.phase = "check";
      save(); renderLesson(n); return;
    }

    var p = e.target.closest("[data-pick]");
    if (p && R && R.phase === "check" && R.qsh && R.qsh.picked < 0) {
      var k = +p.dataset.pick, qq = R.qs[R.qi];
      R.qsh.picked = k;
      var correct = R.qsh.order[k] === qq.c;
      var rec = P.mcq[qq.id] || [0, 0];
      rec[0]++; if (correct) rec[1]++;
      P.mcq[qq.id] = rec;
      logConf(R.qconf, correct);
      todayRec().items++;
      if (!correct) { R.qs.push(qq); R.errs++; logMiss(n, "q", qq.id, R.qconf); }
      save(); renderLesson(n); return;
    }
  }
  function stepQuestion(R, n) { R.qi++; R.qsh = null; R.qconf = null; renderLesson(n); }

  function gotoSection(sid, n) {
    setMode("ref", true); showReturn(n);
    var t = document.getElementById(sid);
    if (!t) { window.scrollTo(0, 0); return; }
    var de = document.documentElement, prev = de.style.scrollBehavior;
    de.style.scrollBehavior = "auto";
    /* measured, so it clears the sticky bar however tall the notch makes it */
    var tb = document.querySelector("#qr-root .topbar");
    var pad = (tb ? tb.getBoundingClientRect().height : 46) + 18;
    var aim = function () { window.scrollTo(0, t.getBoundingClientRect().top + window.pageYOffset - pad); };
    aim(); [40, 160, 400, 800].forEach(function (d) { setTimeout(aim, d); });
    setTimeout(function () { de.style.scrollBehavior = prev; }, 900);
  }

  function finish(n) {
    var R = RUN;
    if (!R || (R.summary || "").trim().length < 12) return;
    P.done[n] = Date.now();
    P.sum[n] = R.summary.trim();
    if (R.errs) P.err[n] = (P.err[n] || 0);
    todayRec().lessons++; todayRec().mins = Math.round(todayRec().mins + 0);
    markSectionUnderstood(lesson(n).s);
    save();
    R.phase = "done";
    P.cur = nextAfter(n);            /* carry on from here, not back to the earliest gap */
    save();
    applyVeil(); updateBar(); renderSide(); renderLesson(n);
  }

  function runDrills(n, need) {
    var L = lesson(n), vols = L.v || [], T = window.__TRAINER__;
    if (!T || !vols.length) { RUN.drill = { n: 0, ok: 0, pass: true }; RUN.phase = "gate"; renderLesson(n); return; }
    setMode("trn", true);
    var handedOver = false;
    setTimeout(function () {                 /* the Trainer never came back */
      if (!handedOver && window.__QC_MODE__ === "trn") {
        var r = document.getElementById("tr-root");
        if (!r || r.offsetHeight < 8) { setMode("path", true); renderLesson(n); }
      }
    }, 4000);
    try {
    T.run(vols, need, function (res) {
      handedOver = true;
      var pass = res.n > 0 && res.ok / res.n >= 0.7;
      P.drill[n] = { n: res.n, ok: res.ok, pass: pass };
      todayRec().items += res.n;
      if (!pass) P.err[n] = (P.err[n] || 0) + (res.n - res.ok);
      save(); setMode("path");
      if (RUN && RUN.n === n) { RUN.drill = P.drill[n]; if (pass) RUN.phase = "gate"; renderLesson(n); }
      else render();
    });
    } catch (e) {                            /* the Trainer threw on the way in */
      handedOver = true;
      setMode("path", true);
      RUN.drill = { n: 0, ok: 0, pass: true };
      RUN.phase = "gate";
      renderLesson(n);
    }
  }

  /* ============================================================
     STANDALONE REVIEW SESSION
     ============================================================ */
  var REV = null;
  function startReview() {
    var q = dueCards(60);
    if (!q.length) { P.screen = "map"; save(); render(); return; }
    REV = { q: q, i: 0, shown: false, attempt: "", ok: 0, again: 0 };
    P.screen = "review"; save(); renderReview();
  }
  function renderReview() {
    if (!REV) { P.screen = "map"; save(); return renderMap(); }
    var h = ['<div class="qc-wrap">'];
    h.push('<p class="qc-crumb"><a data-act="map">The path</a> <span>›</span> review</p>');
    h.push("<h1>What is due</h1>");
    if (REV.i >= REV.q.length) {
      h.push('<div class="qc-pass"><h2>' + REV.ok + " of " + (REV.ok + REV.again) + " held</h2>" +
        "<p>Interleaved across volumes, which is why it felt harder than working one topic at a time. " +
        "Anything marked <b>Again</b> is back in the queue for today.</p>" +
        '<div class="qc-row"><button type="button" class="qc-btn pri" data-act="cur">On to lesson ' +
        resumeN() + '</button><button type="button" class="qc-btn ghost" data-act="map">The path</button>' +
        (dueCount() ? '<button type="button" class="qc-btn ghost" data-act="review">Keep reviewing (' +
          dueCount() + " left)</button>" : "") + "</div></div>");
      h.push("</div>"); main.innerHTML = h.join(""); return;
    }
    var it = REV.q[REV.i], c = CM[it.id], src = LES[it.n - 1];
    h.push('<div class="qc-panel hi">');
    h.push('<p class="qc-tick">' + (REV.i + 1) + " of " + REV.q.length +
      ' · <span class="qc-from">lesson ' + it.n + ", " + esc(src.num || src.t) + "</span></p>");
    h.push('<div class="qc-q">' + c.q + "</div>");
    if (!REV.shown) {
      h.push('<textarea id="qc-att" rows="2" placeholder="Produce it before you look."></textarea>');
      h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="rvreveal">Reveal</button>' +
        '<button type="button" class="qc-btn ghost" data-act="rvblank">I could not produce it</button></div>');
    } else {
      if (REV.attempt) h.push('<div class="qc-att"><b>You wrote</b>' + esc(REV.attempt) + "</div>");
      h.push('<div class="qc-a">' + c.a + "</div>");
      h.push(grades().replace(/data-grade/g, "data-rvgrade"));
    }
    h.push("</div>");
    h.push('<p class="qc-keys"><kbd>↵</kbd> reveal · <kbd>1</kbd>–<kbd>4</kbd> grade · <kbd>esc</kbd> the path</p>');
    h.push("</div>");
    main.innerHTML = h.join("");
    var at = $("#qc-att", main); if (at) at.focus();
  }

  /* ============================================================
     STAGE EXAM
     ============================================================ */
  function examPool(si) {
    var out = [];
    STG[si].ls.forEach(function (idx) {
      (LES[idx].q || []).forEach(function (id) { if (QM[id]) out.push({ q: QM[id], n: idx + 1 }); });
    });
    return out;
  }
  var EX = null;
  function startExam(si) {
    var pool = shuffle(examPool(si)).slice(0, 20);
    if (pool.length < 6) return;
    EX = { si: si, items: pool, i: 0, ok: 0, picked: -1, order: null, wrong: [] };
    P.screen = "exam"; save(); renderExam();
  }
  function renderExam() {
    if (!EX) { P.screen = "map"; save(); return renderMap(); }
    var S = STG[EX.si], h = [];
    h.push('<div class="qc-wrap">');
    h.push('<p class="qc-crumb"><a data-act="map">The path</a> <span>›</span> ' + esc(S.t) + " <span>›</span> stage exam</p>");
    h.push("<h1>Test out — " + esc(S.lab && S.lab !== "—" ? S.lab : S.t) + "</h1>");
    if (EX.i >= EX.items.length) {
      var pct = Math.round(EX.ok / EX.items.length * 100), pass = pct >= 90;
      if (pass) {
        S.ls.forEach(function (idx) {
          if (!P.done[idx + 1]) {
            P.done[idx + 1] = Date.now(); P.tested[idx + 1] = 1;
            P.sum[idx + 1] = "(cleared by stage exam)";
            markSectionUnderstood(LES[idx].s);
          }
        });
        todayRec().lessons += S.ls.length;
        P.cur = nextAfter(S.ls[S.ls.length - 1] + 1);   /* the cleared stage is behind you now */
        save(); applyVeil(); updateBar();
      }
      h.push('<div class="' + (pass ? "qc-pass" : "qc-fail") + '"><h2>' + EX.ok + " of " + EX.items.length +
        " — " + pct + "%</h2><p>" +
        (pass ? "Cleared. Every lesson in this stage is marked passed and tagged as tested out rather than read. " +
          "The sections stay open in the reference whenever you want them."
          : "90% clears the stage. Below that, the honest move is the path itself — the lessons you missed are " +
            "the ones the exam has just named.") + "</p>");
      if (EX.wrong.length) {
        h.push('<p class="qc-note"><b>Missed:</b> ' + EX.wrong.map(function (w) {
          return '<a data-act="jump" data-n="' + w + '" style="color:var(--accent);cursor:pointer">lesson ' + w + "</a>";
        }).join(", ") + "</p>");
      }
      h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="map">Back to the path</button></div></div>');
      h.push("</div>"); main.innerHTML = h.join(""); return;
    }
    var it = EX.items[EX.i], q = it.q;
    if (!EX.order) { EX.order = shuffle(q.o.map(function (t, i) { return i; })); EX.picked = -1; }
    h.push('<p class="qc-tick">Question ' + (EX.i + 1) + " of " + EX.items.length +
      " · " + EX.ok + " right so far · 90% to clear</p>");
    h.push('<div class="qc-panel hi"><div class="qc-q">' + q.q + '</div><div class="qc-opts">');
    EX.order.forEach(function (oi, k) {
      var cls = "qc-opt";
      if (EX.picked >= 0) { if (oi === q.c) cls += " right"; else if (k === EX.picked) cls += " wrong"; }
      h.push('<button type="button" class="' + cls + '" data-expick="' + k + '"' +
        (EX.picked >= 0 ? " disabled" : "") + '><kbd>' + (k + 1) + "</kbd><span>" + esc(q.o[oi]) + "</span></button>");
    });
    h.push("</div>");
    if (EX.picked >= 0) {
      var right = EX.order[EX.picked] === q.c;
      h.push('<div class="qc-why ' + (right ? "good" : "bad") + '"><b>' + (right ? "Right." : "No.") + "</b> " + q.w +
        ' <a data-act="jump" data-n="' + it.n + '" style="color:var(--accent);cursor:pointer">Lesson ' + it.n + "</a></div>");
      h.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-act="exnext">' +
        (EX.i + 1 < EX.items.length ? "Next" : "See the result") + "</button></div>");
    }
    h.push("</div>");
    h.push('<p class="qc-keys"><kbd>1</kbd>–<kbd>4</kbd> choose · <kbd>↵</kbd> next · <kbd>esc</kbd> the path</p>');
    h.push("</div>");
    main.innerHTML = h.join("");
  }

  /* ============================================================
     PROGRESS
     ============================================================ */
  function renderStats() {
    var h = [];
    h.push('<div class="qc-wrap">');
    h.push('<p class="qc-crumb"><a data-act="map">The path</a> <span>›</span> progress</p>');
    h.push("<h1>Where you actually are</h1>");

    var mSeen = 0, mRight = 0;
    Object.keys(P.mcq).forEach(function (k) { mSeen += P.mcq[k][0]; mRight += P.mcq[k][1]; });
    var dn = 0, dok = 0;
    Object.keys(P.drill).forEach(function (k) { dn += P.drill[k].n; dok += P.drill[k].ok; });
    var cal = calibration();

    h.push('<div class="qc-stats">');
    h.push(stat(doneCount() + " / " + N, "lessons passed"));
    h.push(stat(Object.keys(P.tested).length, "cleared by exam"));
    h.push(stat(mSeen ? Math.round(mRight / mSeen * 100) + "%" : "—", "first-pass accuracy"));
    h.push(stat(dn ? Math.round(dok / dn * 100) + "%" : "—", "drill accuracy"));
    h.push(stat(dueCount(), "cards due now"));
    h.push(stat(streak(), "day streak"));
    h.push("</div>");

    if (cal) {
      var over = cal.gap;
      h.push("<h2>Calibration</h2>");
      h.push('<div class="qc-stats">');
      h.push(stat(cal.brier.toFixed(3), "Brier score"));
      h.push(stat((over > 0 ? "+" : "") + Math.round(over * 100), "confidence gap, points"));
      h.push(stat(Math.round(cal.acc * 100) + "%", "accuracy when rated"));
      h.push(stat(cal.n, "rated answers"));
      h.push("</div>");
      h.push('<p class="qc-note">' + (Math.abs(over) < 0.05
        ? "Your confidence has tracked your accuracy closely. Calibration is the rarer skill, and it is the one that decides size."
        : over > 0
          ? "You are <b>overconfident</b> by about " + Math.round(over * 100) + " points. Overconfidence is what turns a position that should be small into one that is not — the fix is to notice it here rather than in a drawdown."
          : "You are <b>underconfident</b> by about " + Math.round(-over * 100) + " points. Less costly than the reverse, but it still means leaving conviction, and therefore size, on the table.") + "</p>");
    }

    h.push("<h2>What you missed</h2>");
    if (!P.miss.length) h.push('<p class="qc-note">Items you get wrong are logged here with the lesson they came from. Nothing yet.</p>');
    else {
      var conf = P.miss.filter(function (m) { return m.c != null && m.c >= 0.85; });
      if (conf.length) {
        h.push('<p class="qc-note"><b>' + plural(conf.length, "confident miss") +
          ".</b> Rated certain and answered wrong — the highest-value thing on this page to fix.</p>");
      }
      h.push('<table class="qc-tbl"><thead><tr><th>Lesson</th><th>Item</th><th>When</th></tr></thead><tbody>');
      P.miss.slice(0, 25).forEach(function (m) {
        var L = LES[m.n - 1]; if (!L) return;
        var what = m.k === "q" ? (QM[m.id] ? QM[m.id].q.replace(/<[^>]+>/g, "") : "question")
                               : (CM[m.id] ? CM[m.id].q.replace(/<[^>]+>/g, "") : "card");
        h.push('<tr><td style="width:150px"><a data-act="jump" data-n="' + m.n +
          '" style="color:var(--accent);cursor:pointer">' + esc(L.num || ("Lesson " + m.n)) + "</a></td><td>" +
          esc(what.slice(0, 96)) + (m.c != null && m.c >= 0.85 ? ' <span class="qc-tag warn">was certain</span>' : "") +
          "</td><td style=\"width:96px\">" + esc(dayKey(new Date(m.t))) + "</td></tr>");
      });
      h.push("</tbody></table>");
    }

    h.push("<h2>By stage</h2><table class=\"qc-tbl\"><thead><tr><th>Stage</th><th></th><th class=\"num\">Done</th><th class=\"num\">Left</th></tr></thead><tbody>");
    STG.forEach(function (S, si) {
      var d = stageDone(si), t = S.ls.length, left = 0;
      S.ls.forEach(function (idx) { if (!isDone(idx + 1)) left += LES[idx].m; });
      h.push("<tr><td>" + esc(S.lab || "—") + " · " + esc(S.t) + "</td>" +
        '<td style="width:120px"><span class="qc-bar2' + (d === t ? " full" : "") +
        '"><i style="width:' + (t ? d / t * 100 : 0).toFixed(0) + '%"></i></span></td>' +
        '<td class="num">' + d + " / " + t + "</td>" +
        '<td class="num">' + (left ? Math.round(left / 60) + " h" : "—") + "</td></tr>");
    });
    h.push("</tbody></table>");

    h.push("<h2>Your own words</h2>");
    var lines = Object.keys(P.sum).map(Number).sort(function (a, b) { return b - a; })
      .filter(function (n) { return P.sum[n] && P.sum[n].indexOf("(cleared") !== 0; }).slice(0, 12);
    if (!lines.length) h.push('<p class="qc-note">Every lesson ends with one line in your own words. They collect here.</p>');
    else {
      h.push('<table class="qc-tbl"><tbody>');
      lines.forEach(function (n) {
        h.push("<tr><td style=\"width:150px\"><a data-act=\"jump\" data-n=\"" + n +
          '" style="color:var(--accent);cursor:pointer">' + esc(lesson(n).num || ("Lesson " + n)) + "</a></td><td>" +
          esc(P.sum[n]) + "</td></tr>");
      });
      h.push("</tbody></table>");
    }

    h.push("<h2>Settings</h2>");
    h.push('<div class="qc-setrow"><label><input type="checkbox" data-set="attempt"' +
      (P.set.attempt ? " checked" : "") + "> Require a written attempt before revealing a card</label>" +
      '<span class="qc-note">Generation is the mechanism — an attempt you got wrong primes the answer far better than reading it cold.</span></div>');
    h.push('<div class="qc-setrow"><label><input type="checkbox" data-set="confidence"' +
      (P.set.confidence ? " checked" : "") + "> Ask how sure you are before each question</label>" +
      '<span class="qc-note">One tap. It is what produces the calibration numbers above, and the list of confident misses.</span></div>');
    h.push('<div class="qc-setrow"><label>Session cap <input type="number" min="15" max="240" step="15" ' +
      'data-set="cap" value="' + (P.set.cap || 90) + '"> minutes</label>' +
      '<span class="qc-note">Volume 25A.6 sets ninety minutes with a hard stop. The bar shows elapsed time; the map says when you are past it.</span></div>');

    h.push("<h2>Your data</h2>");
    h.push('<p class="qc-note">Everything is in this browser and nothing is transmitted. Three stores: the path, ' +
      "the reference's card scheduler, and the trainer's. Export writes all three to one file.</p>");
    h.push('<div class="qc-row">' +
      '<button type="button" class="qc-btn" data-act="export">Export everything</button>' +
      '<label class="qc-btn" style="cursor:pointer">Import<input type="file" id="qc-imp" accept="application/json" hidden></label>' +
      '<button type="button" class="qc-btn ghost" data-act="reset">Reset the path</button></div>');
    h.push("</div>");
    main.innerHTML = h.join("");
    var f = $("#qc-imp", main); if (f) f.addEventListener("change", doImport);
    $$("[data-set]", main).forEach(function (i) {
      i.addEventListener("change", function () {
        P.set[i.dataset.set] = i.type === "checkbox" ? i.checked : (parseInt(i.value, 10) || 90);
        save();
      });
    });
  }

  function doExport() {
    var b = { kind: "quant-curriculum", at: new Date().toISOString(), path: P };
    try { b.study = JSON.parse(localStorage.getItem("qr-study-v1") || "null"); } catch (e) {}
    try { b.trainer = JSON.parse(localStorage.getItem("trainer.v2") || "null"); } catch (e) {}
    try { b.forge = JSON.parse(localStorage.getItem("qr-forge-v1") || "null"); } catch (e) {}
    var blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = "quant-curriculum-progress.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 400);
  }
  function doImport(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        if (o.path) { P = o.path; save(); }
        if (o.study) localStorage.setItem("qr-study-v1", JSON.stringify(o.study));
        if (o.trainer) localStorage.setItem("trainer.v2", JSON.stringify(o.trainer));
        if (o.forge) localStorage.setItem("qr-forge-v1", JSON.stringify(o.forge));
        location.reload();
      } catch (err) { window.alert("Could not read that file: " + err.message); }
    };
    r.readAsText(f);
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function build() {
    root = el("div"); root.id = "qc-root";
    root.innerHTML =
      '<div class="qc-app">' +
      '<aside class="qc-side"><div class="qc-side-h">' +
      '<div class="qc-mark"><span class="qc-glyph">Q</span>The Path</div>' +
      '<div class="qc-meter"><i style="width:0%"></i></div>' +
      '<div class="qc-sub"></div></div>' +
      '<div class="qc-stagelist"></div></aside>' +
      '<div class="qc-main"></div></div>';
    document.body.insertBefore(root, document.body.firstChild);
    main = $(".qc-main", root);

    root.addEventListener("click", function (e) {
      try { onClick(e); } catch (err) { recover(err, "while handling a tap"); }
    });
    function onClick(e) {
      var s = e.target.closest("[data-stage]");
      if (s) { P.openStage = (P.openStage === +s.dataset.stage ? -1 : +s.dataset.stage); save(); render(); return; }
      var l = e.target.closest("[data-lesson]");
      if (l) { var n = +l.dataset.lesson; if (unlocked(n)) openLesson(n); return; }
      var x = e.target.closest("[data-exam]");
      if (x) { startExam(+x.dataset.exam); return; }

      if (P.screen === "review") {
        var rg = e.target.closest("[data-rvgrade]");
        if (rg) {
          var grade = +rg.dataset.rvgrade, it = REV.q[REV.i];
          gradeCardThrough(it.id, grade);
          todayRec().reviews++; todayRec().items++;
          if (grade === 0) { REV.q.push(it); REV.again++; logMiss(it.n, "c", it.id, null); }
          else REV.ok++;
          REV.i++; REV.shown = false; REV.attempt = "";
          save(); renderReview(); return;
        }
        var rr = e.target.closest('[data-act="rvreveal"]');
        if (rr) { var ta = $("#qc-att", main); REV.attempt = ta ? ta.value.trim() : ""; REV.shown = true; renderReview(); return; }
        var rb = e.target.closest('[data-act="rvblank"]');
        if (rb) { REV.attempt = ""; REV.shown = true; renderReview(); return; }
        var rm = e.target.closest('[data-act="map"]');
        if (rm) { P.screen = "map"; REV = null; save(); render(); return; }
        var rc = e.target.closest('[data-act="cur"]');
        if (rc) { REV = null; openLesson(resumeN()); return; }
        var rv2 = e.target.closest('[data-act="review"]');
        if (rv2) { startReview(); return; }
        return;
      }

      if (P.screen === "exam") {
        var xp = e.target.closest("[data-expick]");
        if (xp && EX && EX.picked < 0) {
          EX.picked = +xp.dataset.expick;
          if (EX.order[EX.picked] === EX.items[EX.i].q.c) EX.ok++;
          else EX.wrong.push(EX.items[EX.i].n);
          renderExam(); return;
        }
        var xn = e.target.closest('[data-act="exnext"]');
        if (xn && EX) { EX.i++; EX.order = null; EX.picked = -1; renderExam(); return; }
        var xm = e.target.closest('[data-act="map"]');
        if (xm) { P.screen = "map"; EX = null; save(); render(); return; }
        var xj = e.target.closest('[data-act="jump"]');
        if (xj) { EX = null; openLesson(+xj.dataset.n); return; }
        return;
      }

      var ex = e.target.closest('[data-act="export"]'); if (ex) { doExport(); return; }
      var rs = e.target.closest('[data-act="reset"]');
      if (rs) {
        window.__QC_ASK__("Reset the path? Lesson progress is cleared. Your cards and trainer history are untouched.")
          .then(function (ok) { if (ok) { P = blank(); save(); applyVeil(); render(); } });
        return;
      }
      actLesson(e);
    }

    window.addEventListener("keydown", function (e) {
      if (window.__QC_MODE__ !== "path") return;
      var t = e.target;
      var inField = t && /^(INPUT|SELECT)$/.test(t.tagName);
      var inArea = t && t.tagName === "TEXTAREA";
      if (e.key === "Escape") { P.screen = "map"; REV = null; EX = null; save(); render(); return; }
      if (inField) return;
      if (e.key === "r" && !inArea) {
        var rb = $('[data-act="read"]', main) || $('[data-act="begin"]', main);
        if (rb) { e.preventDefault(); rb.click(); }
        return;
      }
      if (/^[1-4]$/.test(e.key) && !inArea) {
        var i = +e.key - 1;
        var b = $('[data-pick="' + i + '"]:not([disabled])', main) ||
                $('[data-expick="' + i + '"]:not([disabled])', main) ||
                $('[data-grade="' + i + '"]', main) || $('[data-rvgrade="' + i + '"]', main) ||
                $$("[data-conf]", main)[Math.min(i, 2)];
        if (b) { e.preventDefault(); b.click(); }
        return;
      }
      if (e.key === "Enter" && (!inArea || e.ctrlKey || e.metaKey)) {
        var p = $('[data-act="qnext"], [data-act="exnext"], [data-act="reveal"]:not([disabled]), ' +
                  '[data-act="rvreveal"], [data-act="begin"], [data-act="next"], [data-act="togate"]', main);
        if (p) { e.preventDefault(); p.click(); }
      }
    });
  }

  function boot() {
    build(); buildBar(); buildVeil(); buildSearchGate();
    if (P.screen === "exam" || P.screen === "review") P.screen = "map";
    if (P.screen === "lesson" && isDone(P.cur)) {
      var nx0 = nextAfter(P.cur);
      if (isDone(nx0)) P.screen = "map";   /* nothing left — land on the path */
      else P.cur = nx0;
      save();
    }
    try {
      var probe = KEY + ".probe";
      localStorage.setItem(probe, "1"); localStorage.removeItem(probe);
    } catch (e) { STORE_OK = false; showStoreWarn(true); }
    setMode(P.mode || "path", true);
    try { render(); } catch (err) { recover(err, "while opening"); }
    if (main && !main.innerHTML.trim()) {        /* nothing drew: go somewhere usable */
      P.screen = "map"; P.run = null; RUN = null; save();
      try { render(); } catch (e) { recover(e, "while opening"); }
    }
    window.addEventListener("error", function (ev) {
      if (main && !main.innerHTML.trim()) recover(ev.error || ev.message, "unexpected");
    });
    /* iOS can restore a discarded web view in a half-built state */
    window.addEventListener("pageshow", function () { watchdog(1200); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) watchdog(1200); });
    watchdog(3000);            /* and once after opening, whatever mode was saved */
    /* O(1) and idle-cheap: the only thing that can hide the whole app is a view
       that is marked on but empty, and that must never be allowed to persist. */
    setInterval(function () { ensureVisible(true); }, 5000);
    if (P.mode === "ref" && P.screen === "lesson" && P.read[P.cur]) showReturn(P.cur);
    function flush() {
      var m = sessMins();
      if (m > SESS_FLUSHED) {
        todayRec().mins = Math.round(todayRec().mins + (m - SESS_FLUSHED));
        SESS_FLUSHED = m;
      }
      snapRun(); save();
    }
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);          /* iOS: the one that fires */
    document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__QC__ = { state: function () { return P; }, go: openLesson, mode: setMode, due: dueCount };
})();

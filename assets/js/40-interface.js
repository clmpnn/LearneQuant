/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [86, 87, 88, 89]. Do not reorder: these
   run in document order and several set shared globals. */
/* ==========================================================================
   THE ROUTE — interface
   Additive. Decorates the path map with the band the reorder created, lets
   you hide everything that is not on the spine, and says plainly where a
   lesson leans on something that now arrives later.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function h(n) { return (Math.round(n / 6) / 10).toFixed(1); }   /* minutes -> hours, 1dp */

  var SP = window.__SPINE__;
  if (!SP || !SP.L || !SP.S) return;
  var LES = SP.L, STG = SP.S, N = LES.length;
  var BANDS = window.__QC_BANDS__ || [];
  var BAND = {}; BANDS.forEach(function (b) { BAND[b.id] = b; });

  var PHASES = [
    { at: 0,  t: "Orientation",
      d: "What trading is, what this document is, and how to study so that any of it stays." },
    { at: 3,  t: "Foundations",
      d: "The mathematics and the research environment. Everything after this assumes both, and nothing after this waits for you." },
    { at: 6,  t: "The market itself",
      d: "What you are actually trading against: the book, the impact your own order has, and who is on the other side." },
    { at: 9,  t: "Survival, and a backtest that does not lie",
      d: "Risk limits, point-in-time data and backtest correctness — deliberately placed before the first strategy rather than after it. Learn these late and everything built in between has to be redone." },
    { at: 12, t: "Alpha, and telling a real one from a fitted one",
      d: "The strategy families, then the validation and deflation that decide whether any of what you just found was ever there." },
    { at: 18, t: "Cost, portfolio and size",
      d: "Turning a signal into a position: what trading actually costs, how forecasts combine, and how much to bet." },
    { at: 23, t: "Ship it",
      d: "Production infrastructure, twelve modules of code that run, and a blueprint built around your own profile." }
  ];

  /* Volume 25.5 excludes five things from the reader's own first year, with a
     reason for each. Four of the five this route already defers into branches;
     Volume 3 it does not, because by dependency the spine needs it. Rather than
     have two parts of one document quietly disagree, the map says so. */
  var EXCL = {
    "Vol 3":  { on: true,  w: "Its failure mode \u2014 adding to a diverging loser \u2014 maps onto your highest-risk facets. Read it here, where the spine needs it; attempt it in size only after a year of demonstrated adherence, with scaling-in disabled in code." },
    "Vol 7":  { on: false, w: "Longest feedback loop, least interpretable output, highest ratio of stimulation to expected P&L." },
    "Vol 9":  { on: false, w: "You cannot compete on latency at any capital level available to you \u2014 take the four habits in 9.5 and leave the rest." },
    "Vol 14": { on: false, w: "24/7 markets and high volatility interact badly with two of your facets." },
    "Vol 20": { on: false, w: "Beyond a first read, interesting and bounded and not on the critical path." }
  };
  var EXCL_LESSON = (function () {
    for (var i = 0; i < LES.length; i++) if (LES[i].s.indexOf("deliberately-excluded") >= 0) return LES[i].n;
    return 0;
  })();

  var ROUTES = {
    spine: { bands: ["spine"],          t: "Spine",      l: "the spine" },
    core:  { bands: ["spine", "build"], t: "+ Build",    l: "the spine and the build stages" },
    all:   { bands: null,               t: "Everything", l: "the whole path" }
  };
  var HRS_WEEK = 25;      /* the weekly budget this route was paced against */
  var LOOP_X   = 3;       /* reading, plus the recall, checks and drills on top */
  var RKEY = "qc.route.v1";

  /* ---------- state ---------- */
  function pstate() {
    try { return JSON.parse(localStorage.getItem("qc.path.v2") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function bandOf(si) { return (STG[si] && STG[si].band) || "spine"; }
  function loadRoute() {
    try {
      var o = JSON.parse(localStorage.getItem(RKEY) || "null");
      if (o && ROUTES[o.f]) return o.f;
    } catch (e) {}
    /* First run: focus the spine, unless there is already progress off it. */
    var d = pstate().done || {}, k, off = false;
    for (k in d) if (d[k] && LES[(k | 0) - 1] && bandOf(LES[(k | 0) - 1].st) !== "spine") { off = true; break; }
    return off ? "all" : "spine";
  }
  var ROUTE = loadRoute();
  function saveRoute() { try { localStorage.setItem(RKEY, JSON.stringify({ f: ROUTE })); } catch (e) {} }
  function inRoute(band) {
    var b = ROUTES[ROUTE].bands;
    return !b || b.indexOf(band) >= 0;
  }

  /* ---------- band arithmetic ---------- */
  var BSTAT = (function () {
    var m = {};
    STG.forEach(function (st) {
      var b = st.band || "spine";
      if (!m[b]) m[b] = { n: 0, mins: 0, stages: 0, first: st.i };
      m[b].stages++;
      st.ls.forEach(function (i) { m[b].n++; m[b].mins += LES[i].m || 0; });
    });
    return m;
  })();

  function routeProgress() {
    var done = pstate().done || {}, tot = 0, pas = 0, left = 0, next = 0;
    LES.forEach(function (l, i) {
      if (!inRoute(bandOf(l.st))) return;
      tot++;
      if (done[i + 1]) pas++;
      else { left += l.m || 0; if (!next) next = i + 1; }
    });
    var st = 0;
    STG.forEach(function (x) { if (inRoute(x.band || "spine")) st++; });
    return { tot: tot, pas: pas, left: left, next: next || 1, stages: st };
  }

  /* ---------- sections: the separators down the map ---------- */
  var SECTIONS = (function () {
    var out = [], cur = null, ph = {};
    PHASES.forEach(function (p) { ph[p.at] = p; });
    STG.forEach(function (st) {
      var b = st.band || "spine", start = false;
      if (!cur || cur.band !== b) start = true;
      if (b === "spine" && ph[st.i]) start = true;
      if (start) {
        var p = (b === "spine" && ph[st.i]) ? ph[st.i] : null;
        cur = {
          band: b, at: st.i, stages: [],
          t: p ? p.t : (BAND[b] ? BAND[b].t : b),
          d: p ? p.d : (BAND[b] ? BAND[b].d : ""),
          kicker: p ? "Spine" : (BAND[b] ? BAND[b].s : "")
        };
        out.push(cur);
      }
      cur.stages.push(st.i);
    });
    out.forEach(function (s) {
      s.n = 0; s.mins = 0;
      s.stages.forEach(function (si) {
        STG[si].ls.forEach(function (i) { s.n++; s.mins += LES[i].m || 0; });
      });
    });
    return out;
  })();
  var SECAT = {}; SECTIONS.forEach(function (s) { SECAT[s.at] = s; });

  /* Published so the lesson layer can say, on any page of the reference,
     where that page sits on the route. */
  window.__QC_ROUTE__ = {
    sections: SECTIONS,
    bands: BAND,
    bandOf: bandOf,
    statOf: function (id) { return BSTAT[id]; },
    sectionFor: function (si) {
      var best = null;
      SECTIONS.forEach(function (s) { if (s.stages.indexOf(si) >= 0) best = s; });
      return best;
    }
  };

  /* ---------- the panel ---------- */
  function panelHTML() {
    var pr = routeProgress(), o = [];
    var totMin = 0; LES.forEach(function (l) { totMin += l.m || 0; });

    o.push('<div class="qcr-panel">');
    o.push('<div class="qcr-top"><div><p class="qcr-eyebrow">Route</p>' +
      "<h2>Walk the spine. Take a branch when you know which one you need.</h2></div>" +
      '<div class="qcr-seg" role="group" aria-label="How much of the path to show">' +
      Object.keys(ROUTES).map(function (k) {
        return '<button type="button" data-qcr="' + k + '" aria-pressed="' + (ROUTE === k) + '">' +
          esc(ROUTES[k].t) + "</button>";
      }).join("") + "</div></div>");

    o.push('<p class="qcr-lede">The ' + N + " lessons are one dependency graph, not one queue. The <b>spine</b> is the " +
      "shortest walk of that graph that ends with a strategy you built, tested honestly, sized and can run — " +
      BSTAT.spine.n + " lessons, " + h(BSTAT.spine.mins) + " hours of reading. Everything else is a branch you " +
      "take once you know the destination, or a reference you open when you need it.</p>");

    /* the bar */
    o.push('<div class="qcr-bar" role="img" aria-label="Each band as a share of the whole path">');
    BANDS.forEach(function (b) {
      var st = BSTAT[b.id]; if (!st) return;
      var done = 0, dn = pstate().done || {};
      LES.forEach(function (l, i) { if (bandOf(l.st) === b.id && dn[i + 1]) done++; });
      o.push('<i class="qcr-seg-' + b.id + (inRoute(b.id) ? " on" : "") + '" style="flex:' + st.n + '" ' +
        'title="' + esc(b.t) + " — " + st.n + ' lessons"><em style="width:' +
        (st.n ? (done / st.n * 100).toFixed(1) : 0) + '%"></em></i>');
    });
    o.push("</div>");

    var lab = ROUTES[ROUTE].l, wk = pr.left * LOOP_X / 60 / HRS_WEEK;
    o.push('<div class="qcr-stats">' +
      '<div class="qcr-stat"><b>' + pr.pas + " / " + pr.tot + "</b><span>passed on " + esc(lab) + "</span></div>" +
      '<div class="qcr-stat"><b>' + h(pr.left) + " h</b><span>of reading left on it</span></div>" +
      '<div class="qcr-stat"><b>' + pr.stages + " / " + STG.length + "</b><span>stages in view</span></div>" +
      "</div>");
    o.push('<p class="qcr-fine">That is reading time. The recall, the checks and the drills take about twice ' +
      "as long again, and they are the part that works — so call it <b>" +
      Math.round(pr.left * LOOP_X / 60) + " hours</b> of real work, roughly <b>" +
      (wk < 1.5 ? "a week" : Math.round(wk) + " weeks") + "</b> at " + HRS_WEEK +
      " hours a week. Every lesson stays open on any route; this only decides what the map lists.</p>");

    o.push('<div class="qcr-bands">');
    BANDS.forEach(function (b) {
      var st = BSTAT[b.id]; if (!st) return;
      var dn = pstate().done || {}, done = 0;
      LES.forEach(function (l, i) { if (bandOf(l.st) === b.id && dn[i + 1]) done++; });
      o.push('<div class="qcr-brow' + (inRoute(b.id) ? " on" : "") + '" data-band="' + b.id + '">' +
        '<span class="qcr-dot qcr-seg-' + b.id + '"></span>' +
        '<span class="qcr-bt"><b>' + esc(b.t) + "</b><em>" + esc(b.d) + "</em></span>" +
        '<span class="qcr-bn">' + done + " / " + st.n + "<em>" + h(st.mins) + " h</em></span></div>");
    });
    o.push("</div>");

    var nl = LES[pr.next - 1];
    o.push('<div class="qc-row"><button type="button" class="qc-btn pri" data-lesson="' + pr.next + '">' +
      (pr.pas ? "Next on " + esc(ROUTES[ROUTE].l) : "Start") + " — lesson " + pr.next + "</button>" +
      '<span class="qcr-next">' + esc((nl.num ? nl.num + " " : "") + nl.t) + "</span></div>");
    o.push("</div>");
    return o.join("");
  }

  /* ---------- decorate the map ---------- */
  function decorateMap(main) {
    var cards = $$(".qc-stagecard", main);
    if (!cards.length) return;

    main.dataset.qcrRoute = ROUTE;

    cards.forEach(function (card) {
      var head = $("[data-stage]", card);
      if (!head) return;
      var si = +head.dataset.stage, st = STG[si];
      if (!st) return;
      card.dataset.band = st.band || "spine";

      var ex = EXCL[st.lab];
      if (ex && !$(".qcr-excl", card)) {
        var e = document.createElement("div");
        e.className = "qcr-excl" + (ex.on ? " clash" : "");
        e.innerHTML = "<b>" + (ex.on ? "On the spine, but deferred by 25.5"
                                     : "Also deferred by 25.5") + ".</b> " + esc(ex.w) +
          (EXCL_LESSON ? ' <button type="button" class="qcr-x" data-lesson="' + EXCL_LESSON +
            '">What is deliberately excluded \u2192</button>' : "");
        card.appendChild(e);
      }

      var sec = SECAT[si];
      if (!sec) return;
      var prev = card.previousElementSibling;
      if (prev && prev.classList.contains("qcr-sep")) return;   /* already there */
      var d = document.createElement("div");
      d.className = "qcr-sep";
      d.dataset.band = sec.band;
      d.innerHTML = '<span class="qcr-kick qcr-seg-' + sec.band + '">' + esc(sec.kicker || "") + "</span>" +
        "<b>" + esc(sec.t) + "</b>" +
        '<span class="qcr-secn">' + sec.n + " lessons \u00b7 " + h(sec.mins) + " h</span>" +
        '<em class="qcr-secd">' + esc(sec.d) + "</em>";
      card.parentNode.insertBefore(d, card);
    });

    var stats = $(".qc-stats", main);
    if (stats && !$(".qcr-panel", main)) {
      var w = document.createElement("div");
      w.innerHTML = panelHTML();
      stats.parentNode.insertBefore(w.firstChild, stats.nextSibling);
    }
  }

  function repaintPanel(main) {
    var old = $(".qcr-panel", main);
    if (!old) return;
    var w = document.createElement("div");
    w.innerHTML = panelHTML();
    old.parentNode.replaceChild(w.firstChild, old);
    main.dataset.qcrRoute = ROUTE;
    decorateSide();
  }

  /* ---------- the sidebar ---------- */
  function decorateSide() {
    var list = $("#qc-root .qc-stagelist");
    if (!list) return;
    list.dataset.qcrRoute = ROUTE;
    $$(".qc-stage-b", list).forEach(function (b) {
      var si = +b.dataset.stage, st = STG[si];
      if (st) b.dataset.band = st.band || "spine";
    });
  }

  /* ---------- forward references on a lesson ---------- */
  function decorateLesson(main) {
    var obj = $(".qc-obj", main);
    if (!obj || $(".qcr-fref", main)) return;
    var ps = pstate();
    var n = (ps.run && ps.run.n) || ps.cur || 0;
    var crumb = $(".qc-crumb", main);
    if (crumb) {
      var m = /lesson\s+(\d+)\s+of/i.exec(crumb.textContent || "");
      if (m) n = +m[1];
    }
    var L = LES[n - 1];
    if (!L || !L.pre || !L.pre.length) return;
    var fwd = L.pre.filter(function (p) { return p > n - 1; });
    if (!fwd.length) return;
    var d = document.createElement("div");
    d.className = "qcr-fref";
    d.innerHTML = "<b>Forward reference.</b> This lesson leans on " +
      fwd.map(function (p) {
        var q = LES[p];
        return '<a data-act="jump" data-n="' + (p + 1) + '">' + esc(q.num || q.t) + "</a> (lesson " + (p + 1) + ")";
      }).join(", ") +
      ", which the route places later. Open it now if you want the full argument, or take the one line it " +
      "supplies on trust and carry on — nothing here is gated.";
    obj.parentNode.insertBefore(d, obj.nextSibling);
  }

  /* ---------- watch the path ---------- */
  function tick() {
    var main = $("#qc-root .qc-main");
    if (!main) return;
    try {
      if ($(".qc-stagecard", main)) decorateMap(main);
      else if ($(".qc-obj", main)) decorateLesson(main);
      decorateSide();
    } catch (e) {}
  }

  function start() {
    var root = document.getElementById("qc-root");
    if (!root) return false;
    var main = $(".qc-main", root);
    if (!main) return false;
    new MutationObserver(function () { tick(); }).observe(main, { childList: true });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-qcr]");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      ROUTE = b.dataset.qcr; saveRoute();
      repaintPanel(main);
    }, true);
    tick();
    return true;
  }

  /* ---------- the reference footer follows the document, not the path ---------- */
  function fixLesnav() {
    var arts = $$("#qr-root article.lesson");
    if (!arts.length) return;
    var seq = arts.map(function (a) { return a.dataset.sec; });
    var BY = {}; LES.forEach(function (l, i) { BY[l.s] = i; });
    function label(i) {
      var l = LES[BY[seq[i]]];
      if (!l) return "";
      return (l.num ? "<em>" + esc(l.num) + "</em> " : "") + esc(l.t);
    }
    function fix(nav) {
      var art = nav.closest("article.lesson"); if (!art) return;
      var i = seq.indexOf(art.dataset.sec); if (i < 0) return;
      var p = nav.querySelector("a.lesnav-prev"), nx = nav.querySelector("a.lesnav-next");
      if (p && i > 0) {
        p.setAttribute("href", "#" + seq[i - 1]);
        var t = p.querySelector(".lesnav-t"); if (t) t.innerHTML = label(i - 1);
      }
      if (nx && i < seq.length - 1) {
        nx.setAttribute("href", "#" + seq[i + 1]);
        var t2 = nx.querySelector(".lesnav-t"); if (t2) t2.innerHTML = label(i + 1);
      }
      nav.dataset.qcrDoc = "1";
    }
    $$("#qr-root nav.lesnav").forEach(fix);
    new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, function (nd) {
          if (nd.nodeType !== 1) return;
          if (nd.classList && nd.classList.contains("lesnav")) fix(nd);
          else if (nd.querySelectorAll) $$("nav.lesnav", nd).forEach(fix);
        });
      });
    }).observe(document.getElementById("qr-root") || document.body, { childList: true, subtree: true });
  }

  function boot() {
    if (!start()) { var t = setInterval(function () { if (start()) clearInterval(t); }, 120); setTimeout(function () { clearInterval(t); }, 12000); }
    try { fixLesnav(); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
/* ==========================================================================
   THE LESSON LAYER
   Two additions, both additive.

   1. A guess before the reading. Attempting an answer you cannot yet know
      and getting it wrong makes the subsequent reading stick harder than
      reading it cold does. The lesson already owns the right question — it
      is the card it will ask you again at Recall — so the only thing missing
      was the order.

   2. Where a page of the reference sits on the route. The path is ordered by
      dependency; the reference is ordered by volume. Landing in Volume 1 from
      a cross-reference used to leave no way of knowing it is a branch that
      comes hundreds of lessons later.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var SP = window.__SPINE__;
  if (!SP || !SP.L) return;
  var LES = SP.L, STG = SP.S, N = LES.length;
  var CM = {};
  (window.__CARDS__ || []).forEach(function (c) { CM[c.i] = c; });
  (window.__NEWCARDS__ || []).forEach(function (c) { if (!CM[c.i]) CM[c.i] = c; });

  /* ------------------------------------------------------------------
     1. THE GUESS
     ------------------------------------------------------------------ */
  var PKEY = "qc.pre.v1";
  function preState() {
    try { return JSON.parse(localStorage.getItem(PKEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function preMark(n) {
    try { var o = preState(); o[n] = 1; localStorage.setItem(PKEY, JSON.stringify(o)); } catch (e) {}
  }

  function lessonNum(main) {
    var c = $(".qc-crumb", main);
    if (c) { var m = /lesson\s+(\d+)\s+of/i.exec(c.textContent || ""); if (m) return +m[1]; }
    try {
      var ps = JSON.parse(localStorage.getItem("qc.path.v2") || "{}");
      return (ps.run && ps.run.n) || ps.cur || 0;
    } catch (e) { return 0; }
  }

  var PRE = null;

  function counter() {
    return PRE && PRE.deck.length > 1
      ? '<span class="qcl-count">' + (PRE.k + 1) + " of " + PRE.deck.length + "</span>" : "";
  }
  function askHTML() {
    var c = PRE.deck[PRE.k];
    return '<p class="qcl-kick">Before you read' + counter() + "</p>" +
      "<h2>" + (PRE.k ? "And this one" : "Have a go at this first") + "</h2>" +
      (PRE.k ? "" :
        "<p class=\"qcl-say\">You are not expected to get it. Committing a wrong answer before you read, " +
        "then seeing the right one straight away, beats reading the section cold \u2014 it then reads as a " +
        "correction rather than as prose. The gain is card by card, so every card this lesson owns is " +
        "asked, and each comes back again at Recall.</p>") +
      '<div class="qcl-q">' + c.q + "</div>" +
      '<textarea id="qcl-att" rows="3" placeholder="Write what you think, or what you would guess. One line is enough."></textarea>' +
      '<div class="qc-row">' +
      '<button type="button" class="qc-btn pri" data-qcl="commit">Commit the guess</button>' +
      '<button type="button" class="qc-btn" data-qcl="blank">No idea — show me</button>' +
      '<button type="button" class="qc-btn ghost" data-qcl="skip">Skip this step</button>' +
      "</div>";
  }
  function shownHTML(attempt) {
    var c = PRE.deck[PRE.k], more = PRE.k < PRE.deck.length - 1;
    return '<p class="qcl-kick">Before you read' + counter() + "</p>" +
      "<h2>" + (attempt ? "Now read it as a correction" : "Read it as an answer to that") + "</h2>" +
      (attempt ? '<div class="qcl-you"><b>What you said</b>' + esc(attempt) + "</div>" : "") +
      '<div class="qcl-a">' + (c.a || "") + "</div>" +
      '<p class="qcl-say">' + (more
        ? "One more this lesson owns, then the section."
        : "Whatever the gap between those two, the section below is now about closing it. The same cards " +
          "come back at Recall, and again on the schedule after that.") + "</p>" +
      '<div class="qc-row">' +
      (more
        ? '<button type="button" class="qc-btn pri" data-qcl="next">Next question</button>'
        : '<button type="button" class="qc-btn pri" data-qcl="go">Read the section</button>' +
          '<button type="button" class="qc-btn ghost" data-qcl="out">Skip the reading — test out</button>') +
      "</div>";
  }

  function buildPre(main) {
    var intro = $(".qc-panel.hi", main);
    if (!intro || !$('[data-act="begin"]', intro)) return;      /* not the intro screen */
    if ($(".qcl-pre", main)) return;

    var n = lessonNum(main), L = LES[n - 1];
    if (!L) return;
    if (preState()[n]) return;

    var deck = (L.c || []).map(function (id) { return CM[id]; })
                 .filter(function (c) { return c && c.q; });
    if (!deck.length) return;

    var box = document.createElement("div");
    box.className = "qcl-pre";
    box.dataset.n = n;
    PRE = { n: n, deck: deck, k: 0 };
    box.innerHTML = askHTML();
    intro.parentNode.insertBefore(box, intro);
    main.classList.add("qcl-pre-open");
    var ta = $("#qcl-att", box); if (ta) ta.focus();
  }

  function revealPre(box, main, attempt) {
    preMark(+box.dataset.n);
    box.innerHTML = shownHTML(attempt);
    /* The original panel stays hidden until the reader leaves this one: it
       offers the same two choices, and showing both would put four buttons
       on screen doing two things. */
  }

  function onPreClick(e, main) {
    var b = e.target.closest("[data-qcl]");
    if (!b) return false;
    var box = $(".qcl-pre", main); if (!box) return false;
    var act = b.dataset.qcl;
    e.preventDefault(); e.stopPropagation();
    if (act === "commit" || act === "blank") {
      var ta = $("#qcl-att", box);
      revealPre(box, main, act === "commit" && ta ? ta.value.trim() : "");
      return true;
    }
    if (act === "next") {
      PRE.k++;
      box.innerHTML = askHTML();
      var t2 = $("#qcl-att", box); if (t2) t2.focus();
      return true;
    }
    if (act === "skip") {
      preMark(+box.dataset.n);
      box.remove(); main.classList.remove("qcl-pre-open");
      return true;
    }
    if (act === "go" || act === "out") {
      main.classList.remove("qcl-pre-open");
      var t = $('[data-act="' + (act === "go" ? "begin" : "skip") + '"]', main);
      box.remove();
      if (t) t.click();
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------
     2. WHERE THIS PAGE SITS ON THE ROUTE
     ------------------------------------------------------------------ */
  var BYSEC = {}; LES.forEach(function (l, i) { BYSEC[l.s] = i; });

  function whereFor(i) {
    var L = LES[i], st = STG[L.st], R = window.__QC_ROUTE__;
    var band = (st && st.band) || "spine";
    var sec = R && R.sectionFor ? R.sectionFor(L.st) : null;
    var bandName = R && R.bands && R.bands[band] ? R.bands[band].t : band;
    var cut = bandName.indexOf("—");
    var kick = band === "spine" ? "Spine"
      : (cut >= 0 ? bandName.slice(0, cut).trim() : bandName);
    var mid = band === "spine" ? (sec ? sec.t : "")
      : (cut >= 0 ? bandName.slice(cut + 1).trim()
                  : (R && R.bands && R.bands[band] ? R.bands[band].s : ""));
    if (mid === kick) mid = "";
    return { band: band, kick: kick, mid: mid, n: L.n };
  }

  function buildWhere(art) {
    if (art.dataset.qclWhere) return;
    art.dataset.qclWhere = "1";
    var i = BYSEC[art.dataset.sec];
    if (i == null) return;
    var w = whereFor(i);
    var head = art.querySelector("h3.sh, h2.vh");
    var p = document.createElement("p");
    p.className = "qcl-where qcr-seg-" + w.band;
    p.innerHTML = '<span class="qcl-wk">' + esc(w.kick) + "</span>" +
      (w.mid ? '<span class="qcl-wm">' + esc(w.mid) + "</span>" : "") +
      '<span class="qcl-wn">lesson ' + w.n + " of " + N + "</span>";
    if (head && head.parentNode === art) head.parentNode.insertBefore(p, head.nextSibling);
    else art.insertBefore(p, art.firstChild);
  }

  function observeRef() {
    var arts = $$("#qr-root article.lesson");
    if (!arts.length) return false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { buildWhere(e.target); io.unobserve(e.target); } });
      }, { rootMargin: "900px 0px" });
      arts.forEach(function (a) { io.observe(a); });
    }
    /* and finish the rest in idle slices, so arriving by search or a
       cross-reference never lands on a page with no bearing */
    var k = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 60); };
    (function slice(dl) {
      var budget = 0;
      while (k < arts.length && budget < 40 && (!dl || dl.timeRemaining() > 2)) { buildWhere(arts[k++]); budget++; }
      if (k < arts.length) idle(slice);
    })(null);
    return true;
  }

  /* ------------------------------------------------------------------
     3. THE TRAINER, RESTRICTED TO WHAT YOU HAVE PASSED
     The engine already accepts a volume restriction; nothing ever offered
     one, so a session opened on lesson 12 drew from all twenty-six volumes.
     ------------------------------------------------------------------ */
  function pathTags() {
    var P, done, set = {}, k, l;
    try { P = JSON.parse(localStorage.getItem("qc.path.v2") || "{}"); } catch (e) { P = {}; }
    done = P.done || {};
    for (k in done) {
      if (!done[k]) continue;
      l = LES[(k | 0) - 1];
      if (!l) continue;
      (l.v || []).forEach(function (t) { set[String(t)] = 1; });
    }
    return Object.keys(set);
  }

  function wirePathBtn() {
    var btn = document.getElementById("pathBtn");
    if (!btn || btn.dataset.qclWired) return !!btn;
    btn.dataset.qclWired = "1";
    var T = window.__TRAINER__;
    function refresh() {
      var tags = pathTags();
      var n = 0;
      try { n = T && T.count ? T.count(tags) : 0; } catch (e) {}
      btn.textContent = "Path" + (n ? " " + n : "");
      btn.disabled = !n;
      btn.title = n
        ? "Only the " + n + " items belonging to lessons you have already passed"
        : "Nothing yet \u2014 pass a lesson on the Path and its drills appear here";
      return n;
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!T || !T.run) return;
      var tags = pathTags(), n = refresh();
      if (!n) return;
      T.run(tags, Math.min(25, n));
    }, true);
    refresh();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    var bar = document.getElementById("qc-bar");
    if (bar) bar.addEventListener("click", function () { setTimeout(refresh, 60); }, true);
    return true;
  }

  /* ------------------------------------------------------------------
     boot
     ------------------------------------------------------------------ */
  function start() {
    var root = document.getElementById("qc-root");
    if (!root) return false;
    var main = $(".qc-main", root);
    if (!main) return false;
    root.addEventListener("click", function (e) {
      try { onPreClick(e, main); } catch (err) {}
    }, true);
    new MutationObserver(function () {
      try { buildPre(main); } catch (e) {}
    }).observe(main, { childList: true });
    try { buildPre(main); } catch (e) {}
    return true;
  }

  function boot() {
    if (!start()) {
      var t = setInterval(function () { if (start()) clearInterval(t); }, 120);
      setTimeout(function () { clearInterval(t); }, 12000);
    }
    if (!wirePathBtn()) {
      var t3 = setInterval(function () { if (wirePathBtn()) clearInterval(t3); }, 200);
      setTimeout(function () { clearInterval(t3); }, 15000);
    }
    if (!observeRef()) {
      var t2 = setInterval(function () { if (observeRef()) clearInterval(t2); }, 200);
      setTimeout(function () { clearInterval(t2); }, 12000);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
/* ==========================================================================
   iOS / Sitecase — the parts CSS cannot fix
   Sitecase opens this file from local storage, so the page runs on a file:
   URL inside WKWebView. Two consequences drive everything here:
     1. file: is not a secure context in WebKit, so navigator.clipboard is
        undefined and every copy button that assumes it does nothing.
     2. A blob: download from a file: document is a no-op in WKWebView, so
        every "Export" in this document silently fails on iPhone and iPad —
        on the one platform where localStorage is documented to be cleared
        out from under a local page. The backup was the safety net, and the
        safety net was the thing that did not work.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var KEYS = ["qc.path.v2", "qr-study-v1", "trainer.v2", "qr-forge-v1", "qc.route.v1", "qc.pre.v1"];
  var CANARY = "qc.canary.v1";

  function isWebKit() {
    var ua = navigator.userAgent;
    return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  }
  function downloadsAreReliable() {
    /* A blob download needs a real browser chrome to land in. On a file: URL
       inside WebKit there is none, and the click resolves into nothing. */
    return !(location.protocol === "file:" && isWebKit());
  }

  /* ---------- clipboard that works without a secure context ---------- */
  function copyText(txt, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { cb(true); }, function () { legacy(); });
    } else legacy();
    function legacy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = txt;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.contentEditable = "true";
        var range = document.createRange(); range.selectNodeContents(ta);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        ta.setSelectionRange(0, txt.length);
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        cb(!!ok);
      } catch (e) { cb(false); }
    }
  }
  window.__QC_COPY__ = copyText;

  /* the Forge's "Copy the Python" assumed navigator.clipboard and did nothing
     without it; catch the click first and route it through the fallback */
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest('[data-dl="copy"]') : null;
    if (!t || (navigator.clipboard && navigator.clipboard.writeText)) return;
    var code = document.getElementById("fgPy");
    if (!code) return;
    e.preventDefault(); e.stopPropagation();
    copyText(code.textContent, function (ok) {
      var old = t.textContent;
      t.textContent = ok ? "Copied" : "Select it and copy";
      setTimeout(function () { t.textContent = old; }, 1500);
    });
  }, true);

  /* ---------- the backup itself ---------- */
  function payload() {
    var out = { kind: "quant-curriculum-backup", at: new Date().toISOString(), v: 1, data: {} };
    KEYS.forEach(function (k) {
      try { var raw = localStorage.getItem(k); if (raw != null) out.data[k] = raw; } catch (e) {}
    });
    return JSON.stringify(out);
  }
  function restore(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return "That is not the backup text — it should start with a brace."; }
    var data = o && (o.data || (o.kind ? null : o));
    if (!data || typeof data !== "object") return "No progress found inside that text.";
    var n = 0;
    Object.keys(data).forEach(function (k) {
      if (KEYS.indexOf(k) < 0) return;
      var v = data[k];
      try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); n++; } catch (e) {}
    });
    return n ? null : "Nothing in that text matched this document's saved data.";
  }

  var FOCUS_SEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function openBackup(msg) {
    if ($("#qc-bk")) return;
    var returnTo = document.activeElement;
    var text = payload();
    var d = document.createElement("div");
    d.id = "qc-bk";
    d.innerHTML =
      '<div class="qc-bk-card" role="dialog" aria-modal="true" aria-label="Back up and restore">' +
      (msg ? '<p class="qc-bk-alert">' + msg + "</p>" : "") +
      "<h2>Back up your progress</h2>" +
      "<p>Saving a file does not work when this document is opened from local storage on iPhone or " +
      "iPad, so the backup is text. Copy it and paste it anywhere you keep things &mdash; Notes, a " +
      "file, an email to yourself. Pasting it back into the second box restores everything.</p>" +
      '<textarea id="qc-bk-out" readonly rows="4" spellcheck="false"></textarea>' +
      '<div class="qc-bk-row"><button type="button" class="qc-bk-b pri" id="qc-bk-copy">Copy the backup</button>' +
      '<span class="qc-bk-note" id="qc-bk-msg"></span></div>' +
      "<h2>Restore</h2>" +
      '<textarea id="qc-bk-in" rows="3" spellcheck="false" placeholder="Paste a backup here"></textarea>' +
      '<div class="qc-bk-row"><button type="button" class="qc-bk-b" id="qc-bk-put">Restore and reload</button>' +
      '<button type="button" class="qc-bk-b ghost" id="qc-bk-x">Close</button></div>' +
      "</div>";
    document.body.appendChild(d);
    var out = $("#qc-bk-out"); out.value = text;
    $("#qc-bk-copy").addEventListener("click", function () {
      out.focus(); out.setSelectionRange(0, out.value.length);
      copyText(text, function (ok) {
        $("#qc-bk-msg").textContent = ok ? "Copied." : "Not copied — select the text above and copy it by hand.";
      });
    });
    $("#qc-bk-put").addEventListener("click", function () {
      var err = restore($("#qc-bk-in").value.trim());
      if (err) { $("#qc-bk-msg").textContent = err; return; }
      document.documentElement.style.overflow = "";
      location.reload();
    });
    /* A dialog that says aria-modal="true" while the page behind it is still
       reachable by Tab is worse than no dialog at all: it tells assistive
       technology the rest of the page is inert when it is not. */
    function close() {
      document.removeEventListener("keydown", onKey, true);
      d.remove();
      document.documentElement.style.overflow = prevOverflow;
      /* The panel that owns the trigger is re-rendered whenever the map draws,
         so the node captured on open is usually detached by now and focusing
         it silently does nothing. Find the live one by id. */
      /* and land the focus after any re-render this close may have triggered */
      var backId = (returnTo && returnTo.id) || "qc-bk-open";
      var tries = 0;
      (function land() {
        var el = document.getElementById(backId);
        if (el && el.isConnected) { try { el.focus(); } catch (e) {} return; }
        if (tries++ < 8) setTimeout(land, 40);
      })();
    }
    function focusables() {
      return $$(FOCUS_SEL, d).filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
    }
    function onKey(e) {
      if (e.key === "Escape" || e.key === "Esc") {
        /* The Path binds Escape to "back to the map" and re-renders it. If that
           runs too, it rebuilds the panel holding our trigger and focus lands
           on nothing. This Escape belongs to the dialog. */
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        close(); return;
      }
      if (e.key !== "Tab") return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !d.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !d.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    }
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";   /* the page behind must not scroll */
    document.addEventListener("keydown", onKey, true);
    $("#qc-bk-x").addEventListener("click", close);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    var f0 = focusables();
    if (f0.length) f0[0].focus(); else d.querySelector(".qc-bk-card").focus();
  }
  window.__QC_BACKUP__ = openBackup;

  /* ---------- did storage survive since last time? ---------- */
  function canary() {
    var prev = null;
    try { prev = JSON.parse(localStorage.getItem(CANARY) || "null"); } catch (e) {}
    var hasPath = false;
    try { hasPath = !!localStorage.getItem("qc.path.v2"); } catch (e) { return; }
    if (prev && prev.had && !hasPath) {
      openBackup("<b>Your saved progress is gone.</b> This document was storing lessons on " +
        (prev.at ? prev.at.slice(0, 10) : "a previous visit") + " and that store is now empty — " +
        "which is what iOS does to a local page's storage. Restore a backup below if you have one, " +
        "and keep one from now on.");
    }
    try { localStorage.setItem(CANARY, JSON.stringify({ at: new Date().toISOString(), had: hasPath })); } catch (e) {}
  }

  /* ---------- offer it where it will be seen ---------- */
  function addEntry() {
    var panel = $("#qc-root .qcr-panel");
    if (!panel || $("#qc-bk-open")) return false;
    var row = document.createElement("div");
    row.className = "qcr-backup";
    row.innerHTML = '<button type="button" id="qc-bk-open" class="qc-btn ghost">Back up / restore</button>' +
      '<span>' + (downloadsAreReliable()
        ? "Keeps a copy of every lesson, card and drill you have passed."
        : "On iPhone and iPad this document’s storage can be cleared without warning, and saving a " +
          "file does not work here. This is the copy that survives.") + "</span>";
    panel.appendChild(row);
    $("#qc-bk-open").addEventListener("click", function () { openBackup(""); });
    return true;
  }

  /* ---------- say something while a slow device lays out ---------- */
  function busy() {
    var el = document.createElement("div");
    el.id = "qc-busy"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
    var t = null;
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("#qc-bar button[data-mode]") : null;
      if (!b) return;
      var label = { ref: "Opening the reference", trn: "Opening the trainer", path: "Opening the path" };
      el.textContent = label[b.dataset.mode] || "Opening";
      el.classList.add("on");
      clearTimeout(t);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.classList.remove("on");
        });
      });
      t = setTimeout(function () { el.classList.remove("on"); }, 12000);
    }, true);
  }

  function boot() {
    try { canary(); } catch (e) {}
    try { busy(); } catch (e) {}
    var main = $("#qc-root .qc-main");
    if (main) new MutationObserver(function () { try { addEntry(); } catch (e) {} })
      .observe(main, { childList: true });
    setTimeout(addEntry, 400);
    /* a keyboard way in, for the desktop copy of the same file */
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault(); openBackup("");
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
/* ==========================================================================
   DOWNLOADS
   Five places in this document hand the reader a file, and all five do it the
   same way: build a Blob, make an object URL, click a hidden <a download>.
   That works in a browser tab and nowhere else. In an artifact viewer the page
   is never granted download permission, and in an iOS web view opened from a
   local file the click resolves into nothing — so the export buttons look like
   they worked and produced no file.

   Rather than rewrite five call sites, this intercepts the click. Where the
   platform offers a save capability the file goes through it; everywhere else
   the original behaviour is left completely alone.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.URL || !URL.createObjectURL) return;

  /* Remember what each object URL was made from, so the blob can be handed
     over without re-fetching it (a fetch of blob: is not guaranteed here). */
  var BLOBS = new Map ? new Map() : null;
  if (BLOBS) {
    var orig = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      var u = orig.call(URL, obj);
      try { BLOBS.set(u, obj); } catch (e) {}
      return u;
    };
    var revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function (u) {
      /* keep the mapping a moment longer than the page does: the click and the
         revoke often land in the same tick */
      setTimeout(function () { try { BLOBS.delete(u); } catch (e) {} }, 15000);
      return revoke.call(URL, u);
    };
  }

  var SAVE = null;              /* the capability, once it answers */
  var ALLOWED = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx)$/i;

  function toast(msg, bad) {
    var el = document.getElementById("qc-dl-msg");
    if (!el) {
      el = document.createElement("div");
      el.id = "qc-dl-msg"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = bad ? "on bad" : "on";
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.className = ""; }, 5200);
  }

  document.addEventListener("click", function (e) {
    if (!SAVE) return;                                   /* no capability: leave the page alone */
    var a = e.target && e.target.closest ? e.target.closest("a[download]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("blob:") !== 0 && href.indexOf("data:") !== 0) return;
    var name = a.getAttribute("download") || "download.txt";
    e.preventDefault(); e.stopPropagation();

    if (!ALLOWED.test(name)) {
      /* .py is not a format the save surface accepts. Say so plainly rather
         than quietly renaming the file to something it is not. */
      toast("This viewer cannot save “" + name + "”. Use the copy button and paste it into a file.", true);
      return;
    }
    var data = BLOBS ? BLOBS.get(href) : null;
    var go = data ? Promise.resolve(data)
                  : fetch(href).then(function (r) { return r.blob(); });
    go.then(function (blob) { return SAVE.save({ filename: name, data: blob }); })
      .then(function (res) { if (res && res.status === "saved") toast("Saved " + name + "."); })
      .catch(function (err) {
        var c = err && err.code;
        if (c === "declined") return;                    /* the viewer said no; say nothing */
        if (c === "rejected_extension" || c === "extension_not_enabled")
          toast("This viewer cannot save that file type.", true);
        else if (c === "rate_limited") toast("A save is already open — finish that one first.", true);
        else toast("That file could not be saved here. Use Back up / restore instead.", true);
      });
  }, true);

  if (window.claude && typeof window.claude.use === "function") {
    try {
      window.claude.use("downloads").then(function (d) { if (d && d.save) SAVE = d; },
                                          function () {});
    } catch (e) {}
  }
})();

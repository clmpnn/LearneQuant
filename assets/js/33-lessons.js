/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [82, 83]. Do not reorder: these
   run in document order and several set shared globals. */
/* ============================================================
   LESSON UNITS — runtime
   Every section of the Reference is now an <article class="lesson">
   carrying its own identity. This layer does three things:

     1. Hydrates the "Check yourself" foot on demand — the retrieval
        cards the lesson owns, then its objective check. Grades go into
        the same qr-study-v1 store the Review queue reads, so a card
        answered here is genuinely scheduled, not a separate toy.
     2. Keeps each article's passed/unpassed state in sync with the
        tick already in its heading, so scrolling shows you where you got to.
     3. Stops the mode bar sitting on top of the prose.

   No dependencies beyond the data already in the file.
   ============================================================ */
(function () {
  "use strict";

  var SP = window.__SPINE__ || { L: [], S: [], Q: [] };
  var LES = SP.L || [];
  var QM = {}; (SP.Q || []).forEach(function (q) { QM[q.id] = q; });
  var CM = {};
  (window.__CARDS__ || []).forEach(function (c) { CM[c.i] = c; });
  (window.__NEWCARDS__ || []).forEach(function (c) { if (!CM[c.i]) CM[c.i] = c; });
  var BY_N = {}; LES.forEach(function (L) { BY_N[L.n] = L; });

  var STUDYKEY = "qr-study-v1";
  var DAY = 86400000;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function today() { return Math.floor(Date.now() / DAY); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- the shared study store ---------- */
  function studyState() {
    try { return window.__STUDY__ && window.__STUDY__.state ? window.__STUDY__.state() : null; }
    catch (e) { return null; }
  }
  function studyWrite(st) {
    try { localStorage.setItem(STUDYKEY, JSON.stringify(st)); return true; }
    catch (e) { return false; }
  }
  function gradeCard(id, g) {
    var S = window.__STUDY__, st = studyState();
    if (!S || !S.schedule || !st) return;
    if (!st.cards) st.cards = {};
    st.cards[id] = S.schedule(st.cards[id], g);
    if (!st.log) st.log = [];
    var t = today(), last = st.log[st.log.length - 1];
    if (last && last[0] === t) { last[1]++; if (g > 0) last[2]++; }
    else st.log.push([t, 1, g > 0 ? 1 : 0]);
    studyWrite(st);
  }
  function sectionDone(sid) {
    var st = studyState();
    return !!(st && st.done && st.done[sid]);
  }
  function markSection(sid, on) {
    var st = studyState(); if (!st) return;
    if (!st.done) st.done = {};
    if (on) st.done[sid] = today(); else delete st.done[sid];
    studyWrite(st);
  }

  /* ============================================================
     1. PASSED STATE ON EVERY ARTICLE
     ============================================================ */
  var ARTS = [];
  function syncStates() {
    ARTS.forEach(function (a) {
      a.classList.toggle("is-done", sectionDone(a.dataset.sec));
    });
  }

  /* ============================================================
     2. THE FOOT — retrieval, then the objective check
     ============================================================ */
  /* one open run per foot: {cards:[], ci, revealed, qs:[], qi, picked, right, wrong} */
  function openFoot(foot) {
    var n = +foot.dataset.les, L = BY_N[n];
    if (!L) return;
    var cards = (L.c || []).map(function (id) { return CM[id]; }).filter(Boolean);
    var qs    = (L.q || []).map(function (id) { return QM[id]; }).filter(Boolean);
    if (!cards.length && !qs.length) return;

    foot.classList.add("is-open");
    var panel = $(".lf-panel", foot);
    if (!panel) { panel = el("div", "lf-panel"); foot.appendChild(panel); }
    foot._run = {
      L: L, cards: cards, qs: shuffle(qs.slice()),
      ci: 0, revealed: false, qi: 0, order: null, picked: -1, right: 0, wrong: 0,
      phase: cards.length ? "recall" : "check"
    };
    drawFoot(foot);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function closeFoot(foot) {
    foot.classList.remove("is-open");
    foot._run = null;
    var p = $(".lf-panel", foot);
    if (p) p.remove();
  }

  function drawFoot(foot) {
    var R = foot._run; if (!R) return;
    var panel = $(".lf-panel", foot);
    var h = [];

    if (R.phase === "recall") {
      var c = R.cards[R.ci];
      h.push('<div class="lf-hd"><span class="lf-step">Recall</span>' +
             '<span>' + (R.ci + 1) + " of " + R.cards.length + "</span>" +
             '<button type="button" class="lf-x" data-lf="close" aria-label="Close">&times;</button></div>');
      h.push('<div class="lf-bd">');
      h.push('<p class="lf-q">' + c.q + "</p>");
      if (!R.revealed) {
        h.push('<label class="sr-only" for="lf-att-' + R.L.n + '">Your answer</label>');
        h.push('<textarea class="lf-att" id="lf-att-' + R.L.n + '" placeholder="Answer from memory first — typing it is the point."></textarea>');
        h.push('<div class="lf-row"><button type="button" class="lf-b pri" data-lf="reveal">Show the answer</button></div>');
        h.push('<p class="lf-keys"><kbd>↵</kbd> reveal</p>');
      } else {
        h.push('<div class="lf-a">' + c.a + "</div>");
        h.push('<p class="lf-tick">How did that go?</p>');
        h.push('<div class="lf-grades">' +
               '<button type="button" data-lf="grade" data-g="0">Missed it</button>' +
               '<button type="button" data-lf="grade" data-g="1">Hard</button>' +
               '<button type="button" data-lf="grade" data-g="2">Got it</button>' +
               '<button type="button" data-lf="grade" data-g="3">Easy</button></div>');
        h.push('<p class="lf-keys"><kbd>1</kbd>–<kbd>4</kbd> grade</p>');
      }
      h.push("</div>");

    } else if (R.phase === "check") {
      var q = R.qs[R.qi];
      if (!R.order) { R.order = shuffle(q.o.map(function (_, i) { return i; })); R.picked = -1; }
      h.push('<div class="lf-hd"><span class="lf-step">Check</span>' +
             '<span>' + (R.qi + 1) + " of " + R.qs.length + "</span>" +
             '<button type="button" class="lf-x" data-lf="close" aria-label="Close">&times;</button></div>');
      h.push('<div class="lf-bd">');
      h.push('<p class="lf-q">' + q.q + "</p>");
      h.push('<ul class="lf-opts">');
      R.order.forEach(function (oi, k) {
        var cls = "lf-opt", dis = "";
        if (R.picked >= 0) {
          dis = " disabled";
          if (oi === q.c) cls += " is-right";
          else if (k === R.picked) cls += " is-wrong";
        }
        h.push('<li><button type="button" class="' + cls + '" data-lf="pick" data-k="' + k + '"' + dis + '>' +
               '<span class="lf-key">' + (k + 1) + "</span><span>" + q.o[oi] + "</span></button></li>");
      });
      h.push("</ul>");
      if (R.picked >= 0) {
        var got = R.order[R.picked] === q.c;
        h.push('<p class="lf-why ' + (got ? "ok" : "no") + '"><b>' +
               (got ? "Correct." : "Not this one.") + "</b> " + q.w + "</p>");
        h.push('<div class="lf-row"><button type="button" class="lf-b pri" data-lf="nextq">' +
               (R.qi + 1 < R.qs.length ? "Next question" : "Finish") + "</button></div>");
      } else {
        h.push('<p class="lf-keys"><kbd>1</kbd>–<kbd>' + R.order.length + "</kbd> choose</p>");
      }
      h.push("</div>");

    } else { /* done */
      var total = R.right + R.wrong;
      h.push('<div class="lf-hd"><span class="lf-step">Done</span>' +
             '<button type="button" class="lf-x" data-lf="close" aria-label="Close">&times;</button></div>');
      h.push('<div class="lf-bd"><div class="lf-done">');
      if (total) h.push("<span><b>" + R.right + "</b> of " + total + " right.</span>");
      h.push("<span>" + (sectionDone(R.L.s)
        ? "This lesson is marked passed."
        : "Mark it passed when you can produce the answers unprompted.") + "</span>");
      h.push("</div>");
      h.push('<div class="lf-row" style="margin-top:.9rem">');
      h.push('<button type="button" class="lf-b ' + (sectionDone(R.L.s) ? "" : "pri") + '" data-lf="mark">' +
             (sectionDone(R.L.s) ? "Mark not passed" : "Mark passed") + "</button>");
      if (R.cards.length) h.push('<button type="button" class="lf-b" data-lf="again">Run it again</button>');
      if (window.__QC__ && window.__QC__.go)
        h.push('<button type="button" class="lf-b" data-lf="path">Open in the Path</button>');
      h.push("</div></div>");
    }

    panel.innerHTML = h.join("");
    var ta = $(".lf-att", panel); if (ta) ta.focus();
  }

  function footAct(foot, act, node) {
    var R = foot._run; if (!R) return;
    if (act === "close") { closeFoot(foot); return; }

    if (act === "reveal") { R.revealed = true; drawFoot(foot); return; }

    if (act === "grade") {
      var g = +node.dataset.g;
      gradeCard(R.cards[R.ci].i, g);
      R.ci++; R.revealed = false;
      if (R.ci >= R.cards.length) R.phase = R.qs.length ? "check" : "done";
      drawFoot(foot);
      return;
    }

    if (act === "pick") {
      if (R.picked >= 0) return;
      R.picked = +node.dataset.k;
      var q = R.qs[R.qi];
      if (R.order[R.picked] === q.c) R.right++; else R.wrong++;
      drawFoot(foot);
      return;
    }

    if (act === "nextq") {
      R.qi++; R.order = null; R.picked = -1;
      if (R.qi >= R.qs.length) R.phase = "done";
      drawFoot(foot);
      return;
    }

    if (act === "mark") {
      var on = !sectionDone(R.L.s);
      markSection(R.L.s, on);
      syncStates(); syncHeadingTick(R.L.s, on);
      drawFoot(foot);
      return;
    }

    if (act === "again") {
      R.ci = 0; R.revealed = false; R.phase = "recall";
      R.qi = 0; R.order = null; R.picked = -1; R.right = 0; R.wrong = 0;
      drawFoot(foot);
      return;
    }

    if (act === "path") {
      try { window.__QC__.go(R.L.n); } catch (e) {}
      return;
    }
  }

  /* keep the tick already in the heading honest when we change state */
  function syncHeadingTick(sid, on) {
    var h = document.getElementById(sid); if (!h) return;
    var b = h.querySelector(".sec-check"); if (!b) return;
    b.classList.toggle("on", on);
    b.innerHTML = on ? "&#10003;" : "";
  }

  /* ---------- delegation ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var open = t.closest("[data-les-open]");
    if (open) {
      var foot = open.closest(".les-foot");
      if (foot) { e.preventDefault(); openFoot(foot); }
      return;
    }
    var act = t.closest("[data-lf]");
    if (act) {
      var f = act.closest(".les-foot");
      if (f) { e.preventDefault(); footAct(f, act.dataset.lf, act); }
      return;
    }
    /* the heading tick is owned by the study system; mirror its effect here */
    if (t.closest(".sec-check")) {
      setTimeout(syncStates, 0);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var open = $(".les-foot.is-open");
    if (!open || !open._run) return;
    var tag = (e.target && e.target.tagName) || "";
    var R = open._run;

    if (e.key === "Escape") { closeFoot(open); return; }

    if (R.phase === "recall") {
      if (!R.revealed && e.key === "Enter" && tag !== "BUTTON") {
        e.preventDefault(); footAct(open, "reveal"); return;
      }
      if (R.revealed && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        var b = $('.lf-grades button[data-g="' + (+e.key - 1) + '"]', open);
        if (b) footAct(open, "grade", b);
        return;
      }
    }
    if (R.phase === "check" && tag !== "TEXTAREA") {
      if (R.picked < 0 && /^[1-9]$/.test(e.key)) {
        var k = +e.key - 1;
        var opt = $('.lf-opt[data-k="' + k + '"]', open);
        if (opt) { e.preventDefault(); footAct(open, "pick", opt); }
        return;
      }
      if (R.picked >= 0 && e.key === "Enter") {
        e.preventDefault(); footAct(open, "nextq"); return;
      }
    }
  });

  /* ============================================================
     3. THE MODE BAR STOPS COVERING THE PROSE
     ============================================================ */
  function bindBar() {
    var bar = document.getElementById("qc-bar");
    if (!bar) return false;
    var last = window.pageYOffset, idle = null, TH = 6;
    window.addEventListener("scroll", function () {
      var y = window.pageYOffset, dy = y - last;
      if (Math.abs(dy) > TH) {
        /* going down through the text: get out of the way. coming back up: return. */
        bar.classList.toggle("qc-bar-away", dy > 0 && y > 220);
        last = y;
      }
      clearTimeout(idle);
      idle = setTimeout(function () { bar.classList.remove("qc-bar-away"); }, 700);
    }, { passive: true });
    bar.addEventListener("mouseenter", function () { bar.classList.remove("qc-bar-away"); });
    return true;
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    ARTS = $$("#qr-root article.lesson");
    syncStates();
    if (!bindBar()) {
      /* the bar is built by the curriculum layer, which may boot after us */
      var tries = 0, iv = setInterval(function () {
        if (bindBar() || ++tries > 40) clearInterval(iv);
      }, 120);
    }
    /* the tick in each heading is attached by the study system on its own
       schedule; re-sync once it has had a chance to run */
    setTimeout(syncStates, 400);
    setTimeout(syncStates, 1600);
    window.addEventListener("focus", syncStates);

    window.__LESSONS__ = {
      arts: function () { return ARTS; },
      sync: syncStates,
      open: function (n) {
        var f = $('.les-foot[data-les="' + n + '"]');
        if (f) openFoot(f);
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
/* ==========================================================================
   REFINEMENT LAYER — runtime
   Additive only. Nothing here reaches into the existing modules' state.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------
     1. TABLES — a scroll region is only a region when it scrolls
     ------------------------------------------------------------------ */
  var TW = [];

  function labelFor(tw, idx, total) {
    var art = tw.closest ? tw.closest("article.lesson, section.vol") : null;
    var h = art ? art.querySelector("h3.sh, h2.vh") : null;
    var where = h ? (h.dataset.t || h.textContent || "").replace(/¶\s*$/, "").trim() : "";
    var what = total > 1 ? "Table " + idx + " of " + total : "Table";
    return where ? what + " — " + where : what;
  }

  function measure(tw) {
    if (!tw.clientWidth) return;          /* not painted yet: nothing true to measure */
    var over = tw.scrollWidth - tw.clientWidth > 2;
    tw.classList.toggle("is-scroll", over);
    if (over) {
      if (!tw.hasAttribute("tabindex")) {
        tw.setAttribute("tabindex", "0");
        tw.setAttribute("role", "region");
        if (!tw.getAttribute("aria-label")) tw.setAttribute("aria-label", tw.dataset.twLabel || "Table");
      }
      if (!tw.querySelector(".tw-hint")) {
        var hint = document.createElement("span");
        hint.className = "tw-hint";
        hint.setAttribute("aria-hidden", "true");
        hint.textContent = "scroll →";
        tw.appendChild(hint);
      }
      /* Pin the row-label column only when pinning actually buys something:
         the table must be meaningfully wider than the frame (otherwise the
         pinned column covers most of what you scrolled to see), and the first
         column must read as a short label rather than as prose. */
      var first = tw.querySelector("tbody tr > *:first-child");
      if (first) {
        var wide = tw.scrollWidth > tw.clientWidth * 1.5;
        var narrow = first.getBoundingClientRect().width < tw.clientWidth * 0.4;
        var short = true, rows = $$("tbody tr", tw), i;
        for (i = 0; i < rows.length && i < 40; i++) {
          var c = rows[i].firstElementChild;
          if (!c || (c.textContent || "").trim().length > 48) { short = false; break; }
        }
        tw.classList.toggle("stick-col", wide && narrow && short);
      }
    } else {
      tw.classList.remove("is-scroll", "stick-col");
      tw.removeAttribute("tabindex"); tw.removeAttribute("role");
      var h = tw.querySelector(".tw-hint"); if (h) h.remove();
    }
    edges(tw);
  }

  function edges(tw) {
    var max = tw.scrollWidth - tw.clientWidth;
    tw.classList.toggle("at-start", tw.scrollLeft <= 1);
    tw.classList.toggle("at-end", max > 0 && tw.scrollLeft >= max - 1);
    if (tw.scrollLeft > 4) tw.classList.add("at-scrolled");
  }

  function initTables() {
    $$("#qr-root .tw").forEach(function (tw) {
      var art = tw.closest ? tw.closest("article.lesson, section.vol") : null;
      var group = art ? $$(".tw", art) : [tw];
      var name = labelFor(tw, group.indexOf(tw) + 1, group.length);
      tw.dataset.twLabel = name;
      /* 212 tables announced only as "table" told a screen-reader user
         nothing about which one they had landed in */
      var t = tw.querySelector("table");
      if (t && !t.getAttribute("aria-label")) t.setAttribute("aria-label", name);
      tw.addEventListener("scroll", function () { edges(tw); }, { passive: true });
      TW.push(tw);
    });
    remeasure();
  }

  var rafId = null;
  function remeasure() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function () {
      rafId = null;
      TW.forEach(measure);
    });
  }

  /* Most of these tables have never been laid out: content-visibility skips
     every offscreen volume, so their width is zero until the browser paints
     them. A ResizeObserver catches the moment each one gains a real box --
     first paint, window resize, sidebar collapse, orientation change -- which
     an IntersectionObserver would miss, because it fires once and by then the
     element may still be unrendered. */
  function observeTables() {
    if (!("ResizeObserver" in window)) { remeasure(); return; }
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) {
        var tw = e.target;
        if (tw.clientWidth) measure(tw);
      });
    });
    TW.forEach(function (tw) { ro.observe(tw); });
  }

  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt); rt = setTimeout(remeasure, 180);
  }, { passive: true });


  /* ------------------------------------------------------------------
     2. LESSON NAVIGATION — built from the spine, so it can never disagree
        with it. Lazy: a lesson's footer is built the first time that
        lesson comes near the viewport, which keeps the boot cost at zero.
     ------------------------------------------------------------------ */
  var SP = null, BYSEC = {}, STAGE = {};

  function spine() {
    if (SP) return SP;
    SP = window.__SPINE__ || null;
    if (SP) {
      SP.L.forEach(function (l, i) { BYSEC[l.s] = i; });
      SP.S.forEach(function (s) { STAGE[s.i] = s; });
    }
    return SP;
  }

  function label(l) {
    return (l.num ? "<em>" + esc(l.num) + "</em> " : "") + esc(l.t);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function buildNav(art) {
    if (art.dataset.lesnav) return;
    art.dataset.lesnav = "1";
    var sp = spine(); if (!sp) return;
    var i = BYSEC[art.dataset.sec];
    if (i == null) return;
    var L = sp.L, cur = L[i], st = STAGE[cur.st], nav, pos, inStage, ofStage;

    inStage = st ? st.ls.indexOf(i) + 1 : 0;
    ofStage = st ? st.ls.length : 0;

    nav = document.createElement("nav");
    nav.className = "lesnav";
    nav.setAttribute("aria-label", "Lesson " + cur.n + " of " + L.length + " — previous and next");

    var prev = i > 0 ? L[i - 1] : null;
    var next = i < L.length - 1 ? L[i + 1] : null;

    var h = "";
    h += prev
      ? '<a class="lesnav-a lesnav-prev" href="#' + prev.s + '" data-lesnav="' + prev.n + '">' +
        '<span class="lesnav-k">\u2190 Previous</span><span class="lesnav-t">' + label(prev) + "</span></a>"
      : '<span class="lesnav-a lesnav-prev is-end" aria-hidden="true"></span>';

    pos = '<span class="lesnav-pos">Lesson <b>' + cur.n + "</b> of " + L.length;
    if (st && ofStage) {
      pos += "<br>" + esc(st.lab === "\u2014" ? st.t : st.lab) +
             " \u00b7 " + inStage + " of " + ofStage;
      pos += '<span class="lesnav-bar" aria-hidden="true"><i style="width:' +
             Math.round((inStage / ofStage) * 100) + '%"></i></span>';
    }
    pos += "</span>";
    h += pos;

    h += next
      ? '<a class="lesnav-a lesnav-next" href="#' + next.s + '" data-lesnav="' + next.n + '">' +
        '<span class="lesnav-k">Next \u2192</span><span class="lesnav-t">' + label(next) + "</span></a>"
      : '<span class="lesnav-a lesnav-next is-end" aria-hidden="true"></span>';

    nav.innerHTML = h;
    art.appendChild(nav);
  }

  function observeLessons() {
    var arts = $$("#qr-root article.lesson");
    if (!arts.length) return;

    /* Anything the reader reaches first gets its footer immediately... */
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { buildNav(e.target); io.unobserve(e.target); }
        });
      }, { rootMargin: "900px 0px" });
      arts.forEach(function (a) { io.observe(a); });
    }

    /* ...and every one of the 368 is built during idle time regardless, in
       small slices, so no lesson can end without a way forward just because
       the reader arrived by a route the observer never saw. */
    var i = 0;
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 60); };
    function slice(deadline) {
      var n = 0;
      while (i < arts.length && n < 60 && (!deadline || deadline.timeRemaining() > 2 || n < 12)) {
        buildNav(arts[i++]); n++;
      }
      if (i < arts.length) idle(slice);
    }
    idle(slice);
  }

  /* ------------------------------------------------------------------
     3. LANDING — say where a cross-reference just put you
     ------------------------------------------------------------------ */
  var landed = null;
  function markLanding() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var t = document.getElementById(id);
    if (!t) return;
    if (landed) landed.classList.remove("qc-landed");
    /* highlight the heading, not the whole section */
    var h = /^H[1-6]$/.test(t.tagName) ? t : (t.querySelector("h2.vh, h3.sh, h4.ssh") || t);
    landed = h;
    h.classList.remove("qc-landed");
    void h.offsetWidth;
    h.classList.add("qc-landed");
  }
  window.addEventListener("hashchange", function () {
    markLanding();
    setTimeout(remeasure, 120);
  });

  /* ------------------------------------------------------------------
     4. THE MODE BAR — away while you read, back the moment you ask
     ------------------------------------------------------------------ */
  function rebar() {
    var old = document.getElementById("qc-bar");
    if (!old || old.dataset.qcRefined) return !!old;
    var bar = old.cloneNode(true);          /* drops the old scroll + click bindings */
    bar.dataset.qcRefined = "1";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "View: path, reference or trainer");
    old.parentNode.replaceChild(bar, old);

    bar.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-mode]");
      if (!b) return;
      var api = window.__QC__;
      if (api && api.mode) { api.mode(b.dataset.mode); }
      show();
    });

    function h() { var v = bar.offsetHeight; if (v) document.documentElement.style.setProperty("--qc-bar-h", v + "px"); }
    h();

    var away = false, last = window.pageYOffset, up = 0;
    function show() { if (away) { away = false; bar.classList.remove("qc-bar-away"); } }
    function keyboardFocusInside() {
      var a = document.activeElement;
      if (!a || !bar.contains(a)) return false;
      /* a click leaves focus on the button too, and that must not pin the bar
         over the text forever -- only a visible (keyboard) focus does */
      try { return a.matches(":focus-visible"); } catch (e) { return true; }
    }
    function hide() {
      if (away || keyboardFocusInside()) return;
      away = true; bar.classList.add("qc-bar-away");
    }

    window.addEventListener("scroll", function () {
      var y = window.pageYOffset, dy = y - last;
      if (Math.abs(dy) < 4) return;
      var doc = document.documentElement;
      var nearTop = y < 240;
      var nearEnd = y + window.innerHeight > doc.scrollHeight - 140;
      if (dy < 0) { up -= dy; if (up > 26) show(); }
      else { up = 0; if (!nearTop && !nearEnd) hide(); }
      if (nearTop || nearEnd) show();
      last = y;
    }, { passive: true });

    /* reaching for it with the pointer counts as asking for it */
    window.addEventListener("pointermove", function (e) {
      if (e.clientY > window.innerHeight - 110) show();
    }, { passive: true });
    bar.addEventListener("pointerenter", show);
    bar.addEventListener("focusin", show);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Tab") show();
    }, true);
    window.addEventListener("resize", function () { h(); show(); }, { passive: true });
    return true;
  }

  /* ------------------------------------------------------------------
     5. LANDMARKS — the path had no main landmark at all
     ------------------------------------------------------------------ */
  function landmarks() {
    var qc = document.getElementById("qc-root");
    if (qc && !qc.getAttribute("role")) {
      qc.setAttribute("role", "main");
      qc.setAttribute("aria-label", "The path");
    }
    var c = document.getElementById("content");
    if (c && !c.getAttribute("aria-label")) c.setAttribute("aria-label", "The reference");
    var tr = document.querySelector("#tr-root main");
    if (tr && !tr.getAttribute("aria-label")) tr.setAttribute("aria-label", "The trainer");
    var sb = document.getElementById("sbnav");
    if (sb && !sb.getAttribute("aria-label")) sb.setAttribute("aria-label", "Volumes");
  }


  /* ------------------------------------------------------------------
     6. KEYBOARD — a way to walk the course a lesson at a time.
        j/k already moved by whole volume, some of which are 36 sections
        long; there was nothing that moved by one lesson.
     ------------------------------------------------------------------ */
  function mode() { return window.__QC_MODE__ || "path"; }

  function currentLesson() {
    var arts = $$("#qr-root article.lesson"), best = null, bestTop = -1e9, i, r;
    for (i = 0; i < arts.length; i++) {
      r = arts[i].getBoundingClientRect();
      if (r.height === 0) continue;              /* skipped by content-visibility */
      if (r.top <= 120 && r.top > bestTop) { bestTop = r.top; best = arts[i]; }
      if (r.top > 120 && best) break;
    }
    return best || arts[0] || null;
  }

  function step(dir) {
    var sp = spine(); if (!sp) return false;
    var art = currentLesson(); if (!art) return false;
    var i = BYSEC[art.dataset.sec];
    if (i == null) return false;
    var t = sp.L[i + dir];
    if (!t) return false;
    var el = document.getElementById(t.s);
    if (!el) return false;
    try { history.pushState(null, "", "#" + t.s); } catch (err) { location.hash = "#" + t.s; }
    align(el);
    markLanding();
    return true;
  }

  function typingIn(e) {
    var t = e.target, tag = (t.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable;
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e)) return;
    if (e.key === "?") { e.preventDefault(); toggleKeys(); return; }
    if (keysOpen() && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggleKeys(false); return; }
    if (mode() !== "ref") return;
    if (e.key === "n") { if (step(1)) e.preventDefault(); return; }
    if (e.key === "p") { if (step(-1)) e.preventDefault(); return; }
  }, true);

  /* ------------------------------------------------------------------
     7. THE SHORTCUTS PANEL the "?" handler was already looking for
     ------------------------------------------------------------------ */
  var KEYS = null, lastFocus = null;

  var SHEET = [
    ["ref", "Reading the reference", [
      ["n", "Next lesson"], ["p", "Previous lesson"],
      ["j", "Next volume"], ["k", "Previous volume"],
      ["/", "Search"], ["[", "Minimise the sidebar"], ["t", "Light or dark"]
    ]],
    ["path", "Working the path", [
      ["↵", "Continue"], ["r", "Read the section"],
      ["1–4", "Grade what you recalled"], ["Esc", "Back to the path"]
    ]],
    ["trn", "Drilling in the trainer", [
      ["↵", "Submit, then continue"], ["1–4", "Choose an option"],
      ["h", "Hint"], ["s", "Skip"], ["u", "Undo the last mark"],
      ["x", "Retire this item"], ["d", "Due queue"],
      ["p", "Progress"], ["j", "Journal"], ["b", "Bank"], ["t", "Light or dark"]
    ]],
    [null, "Anywhere", [["?", "This list"]]]
  ];

  function buildKeys() {
    if (KEYS) return KEYS;
    var w = document.createElement("div");
    w.id = "qc-keys";
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-modal", "true");
    w.setAttribute("aria-labelledby", "qc-keys-h");
    var h = '<div class="kx"><h2 id="qc-keys-h">Keyboard</h2>' +
            '<p class="kxsub">Keys work in the view they belong to. The current view is highlighted.</p>';
    SHEET.forEach(function (g) {
      h += '<div class="kxg" data-for="' + (g[0] || "") + '"><h3>' + esc(g[1]) + "</h3><dl>";
      g[2].forEach(function (row) {
        h += "<dt><kbd>" + esc(row[0]) + "</kbd></dt><dd>" + esc(row[1]) + "</dd>";
      });
      h += "</dl></div>";
    });
    h += '<button type="button" class="kxclose">Close</button></div>';
    w.innerHTML = h;
    document.body.appendChild(w);
    w.addEventListener("click", function (e) {
      if (e.target === w || (e.target.classList && e.target.classList.contains("kxclose"))) toggleKeys(false);
    });
    /* a modal keeps the keyboard inside it */
    w.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = $$('button, [href], [tabindex]:not([tabindex="-1"])', w);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !w.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
    KEYS = w;
    return w;
  }

  function keysOpen() { return !!(KEYS && KEYS.classList.contains("on")); }

  function toggleKeys(force) {
    var w = buildKeys();
    var open = force == null ? !keysOpen() : !!force;
    if (open) {
      var m = mode(), box = w.querySelector(".kx");
      /* the group for the view you are actually in comes first */
      $$(".kxg", w).forEach(function (g) {
        var now = g.dataset.for === m;
        g.classList.toggle("now", now);
        if (now) box.insertBefore(g, box.querySelector(".kxg"));
      });
      lastFocus = document.activeElement;
      w.classList.add("on");
      box.scrollTop = 0;
      box.setAttribute("tabindex", "-1");
      try { box.focus({ preventScroll: true }); } catch (e) {}
    } else {
      w.classList.remove("on");
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
      lastFocus = null;
    }
  }

  /* ------------------------------------------------------------------
     8. MODE CHANGES MOVE FOCUS, so a keyboard reader is not stranded
        at the top of a view they cannot feel
     ------------------------------------------------------------------ */
  function watchMode() {
    var roots = ["qc-root", "qr-root", "tr-root"].map(function (id) { return document.getElementById(id); });
    var seen = mode();
    var mo = new MutationObserver(function () {
      var m = mode();
      if (m === seen) return;
      seen = m;
      remeasure();
      var live = roots.filter(Boolean).filter(function (r) { return r.classList.contains("on"); })[0];
      if (!live) return;
      var target = live.querySelector("h1, h2, [tabindex='-1']") || live;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      try { target.focus({ preventScroll: true }); } catch (e) {}
    });
    roots.filter(Boolean).forEach(function (r) {
      mo.observe(r, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ------------------------------------------------------------------
     9. Tell people the two new keys exist, where the other hints live
     ------------------------------------------------------------------ */
  function hint() {
    var foot = document.querySelector("#qr-root .sb-foot");
    var line = foot ? foot.querySelector(":scope > span") : null;
    if (!line || line.dataset.qcHinted) return;
    line.dataset.qcHinted = "1";
    var kb = '<kbd style="font-family:var(--mono);font-size:10px">';
    line.insertAdjacentHTML("beforeend", " &middot; " + kb + "?</kbd> all keys");
  }


  /* ------------------------------------------------------------------
     10. CROSS-REFERENCES THAT ACTUALLY ARRIVE

     The reference is 880,000px of text and every offscreen volume is skipped
     with content-visibility, using intrinsic sizes measured at phone width.
     So the browser jumps to an anchor using an estimate, then the real
     heights land and the page slides out from under you: measured drift on a
     desktop was 12,000 to 48,000 pixels -- fifteen to fifty screens past the
     section you asked for. The path's own jump already re-aimed four times;
     nothing else did, which is every sidebar link, every table-of-contents
     entry, every browser Back, and all 1,365 in-text cross-references.

     This re-aims at the target until its position stops moving.
     ------------------------------------------------------------------ */
  var aiming = null;

  function topPad() {
    var tb = document.querySelector("#qr-root .topbar");
    return (tb && tb.offsetHeight ? tb.getBoundingClientRect().height : 46) + 18;
  }

  function align(el) {
    if (!el) return;
    if (aiming) { clearTimeout(aiming.t); cancelAnimationFrame(aiming.r); }
    var de = document.documentElement;
    var prevBehav = de.style.scrollBehavior;
    de.style.scrollBehavior = "auto";
    var pad = topPad(), stable = 0, frames = 0, started = Date.now();
    var self = { t: 0, r: 0 };
    aiming = self;

    function aim() {
      var d = el.getBoundingClientRect().top - pad;
      if (Math.abs(d) > 1.5) { window.scrollBy(0, d); stable = 0; }
      else stable++;
      frames++;
      var age = Date.now() - started;
      /* settled, or we have spent long enough chasing it */
      if (stable >= 4 || age > 2600) {
        de.style.scrollBehavior = prevBehav;
        if (aiming === self) aiming = null;
        syncPlace(el);
        remeasure();
        return;
      }
      if (frames < 30) self.r = requestAnimationFrame(aim);
      else self.t = setTimeout(function () { self.r = requestAnimationFrame(aim); }, 90);
    }
    aim();
  }

  function targetOf(hash) {
    var id = decodeURIComponent(String(hash || "").replace(/^#/, ""));
    if (!id) return null;
    return document.getElementById(id);
  }

  function bindAnchors() {
    /* every in-document link, however it was authored */
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var t = targetOf(href);
      if (!t) return;
      /* only take over when the destination is actually on screen in this
         view -- otherwise leave the app's own routing alone */
      if (t.offsetParent === null && !t.getClientRects().length) return;
      e.preventDefault();
      if (location.hash !== href) {
        try { history.pushState(null, "", href); } catch (err) { location.hash = href; }
      }
      align(t);
      /* let a screen reader follow the jump too */
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
      try { t.focus({ preventScroll: true }); } catch (err) {}
      markLanding();
    }, false);

    window.addEventListener("popstate", function () {
      var t = targetOf(location.hash);
      if (t) { align(t); markLanding(); }
    });
    window.addEventListener("hashchange", function () {
      var t = targetOf(location.hash);
      if (t) align(t);
    });
    if (location.hash) setTimeout(function () { align(targetOf(location.hash)); }, 300);
  }


  /* ------------------------------------------------------------------
     11. SEARCH THAT RETURNS SOMETHING

     runSearch() scores each index entry against `it.s`, a lowercase blob of
     the title plus the body. Twelve of the 825 entries -- the volume cards
     for 0C, 0D, 1A, 2B, 5A, 6A, 8B, 8C, 10B, 11B, 12B and 13B, all added in
     a later pass -- were written without that field. The scoring loop hits
     the first one at index 726 and throws, which aborts the whole search
     before a single result is rendered. So the search box in a 368-lesson
     reference has been returning nothing at all.

     The entries are repaired here, exactly as the other 813 were built.
     ------------------------------------------------------------------ */
  function fixIndex() {
    var idx = window.__SEARCH_INDEX__;
    if (!idx || !idx.length) return 0;
    var fixed = 0;
    for (var i = 0; i < idx.length; i++) {
      var e = idx[i];
      if (e && typeof e.s !== "string") {
        e.s = ((e.t || "") + " " + (e.x || "")).toLowerCase();
        fixed++;
      }
    }
    return fixed;
  }

  function guardIndex() {
    fixIndex();
    /* the lock gate rebuilds the array; keep the repair in place */
    var box = document.getElementById("q");
    if (box) box.addEventListener("input", fixIndex, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "/") setTimeout(fixIndex, 0);
    }, true);
  }


  /* ------------------------------------------------------------------
     12. "YOU ARE HERE" reaches assistive technology too.
        The sidebar and the on-this-page list both mark the current entry
        with a class, which is colour only. aria-current says it in words.
     ------------------------------------------------------------------ */
  function currentSync() {
    function sweep(root) {
      $$("a", root).forEach(function (a) {
        var on = a.classList.contains("active");
        if (on) a.setAttribute("aria-current", root.id === "toc" ? "location" : "page");
        else a.removeAttribute("aria-current");
      });
    }
    ["sbnav", "toc"].forEach(function (id) {
      var r = document.getElementById(id);
      if (!r) return;
      sweep(r);
      new MutationObserver(function () { sweep(r); })
        .observe(r, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
  }


  /* ------------------------------------------------------------------
     13. AFTER A JUMP, THE SIDEBAR AGREES WITH THE PAGE
        The volume spy is an IntersectionObserver, and a jump across
        several hundred thousand pixels can deliver its entries in an
        order that leaves the previous volume marked. Once the landing has
        settled, say plainly which volume you are in.
     ------------------------------------------------------------------ */
  function syncPlace(el) {
    if (!el || !el.closest) return;
    var vol = el.closest("section.vol");
    if (!vol || !vol.id) return;
    var link = document.querySelector('#sbnav a[href="#' + vol.id + '"]');
    if (!link) return;
    $$("#sbnav .nav-item").forEach(function (a) { a.classList.toggle("active", a === link); });
    var crumb = document.getElementById("crumb");
    if (crumb) {
      crumb.innerHTML = 'Quant Reference &nbsp;/&nbsp; <b>' +
        esc(link.getAttribute("data-title") || link.textContent || "") + "</b>";
    }
  }

  function boot() {
    guardIndex();
    initTables();
    observeTables();
    observeLessons();
    landmarks();
    markLanding();
    watchMode();
    bindAnchors();
    currentSync();
    hint();
    if (!rebar()) {
      var tries = 0, iv = setInterval(function () {
        if (rebar() || ++tries > 60) clearInterval(iv);
      }, 120);
    }
    window.__QC_REFINE__ = { remeasure: remeasure, tables: function () { return TW; } };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

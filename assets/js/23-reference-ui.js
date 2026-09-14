/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [18, 19, 20, 21, 22, 23, 24]. Do not reorder: these
   run in document order and several set shared globals. */
/* ============================================================
   QUANT REFERENCE — study system
   Retrieval practice, spaced repetition, progress, calculators.
   No dependencies. Degrades to a plain reference if storage fails.
   ============================================================ */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- storage: never throws, never blocks the page ---------- */
  var KEY = "qr-study-v1";
  var memFallback = null;              // used when localStorage is unavailable
  var storageOK = true;
  function readState() {
    if (memFallback) return memFallback;
    try {
      var raw = localStorage.getItem(KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== "object") s = {};
    } catch (e) { storageOK = false; s = {}; }
    if (!s.cards) s.cards = {};        // id -> {d:dueEpochDay, i:intervalDays, e:ease, n:reps, l:lapses}
    if (!s.done)  s.done  = {};        // section id -> epochDay marked understood
    if (!s.gate)  s.gate  = {};        // gate id -> {score, total, at}
    if (!s.log)   s.log   = [];        // [epochDay, reviewed, correct]
    if (!s.opt)   s.opt   = { newPerDay: 12, maxPerDay: 90 };
    memFallback = s;
    return s;
  }
  function writeState() {
    if (!memFallback) return;
    try { localStorage.setItem(KEY, JSON.stringify(memFallback)); }
    catch (e) { storageOK = false; }
  }

  var DAY = 86400000;
  function today() { return Math.floor(Date.now() / DAY); }

  /* ---------- SM-2, simplified and clamped ----------
     Grades: 0 Again, 1 Hard, 2 Good, 3 Easy.
     Ease floors at 1.3 so a card can never become unschedulable; intervals
     cap at ~1 year because nothing here needs a longer horizon and long
     intervals make the deck feel abandoned.                             */
  /* A lapse costs a card a fraction of its interval, not all of it, and the
     ease factor is pulled back towards the middle on every review. Plain SM-2
     does neither: it resets the interval to one day and lets ease ratchet down
     to its 1.3 floor, after which a card that has failed a few times can never
     earn a long interval again however well you then know it. Volume 00.6
     lists four reasons a card keeps failing; this was a fifth, and it was the
     scheduler's fault rather than the card's. */
  var LAPSE_KEEP = 0.35;   /* of the interval survives a failure */
  var EASE_TARGET = 2.5, EASE_REVERT = 0.05;

  function schedule(rec, grade) {
    var t = today();
    rec = rec || { d: t, i: 0, e: 2.5, n: 0, l: 0 };
    if (grade === 0) {
      rec.l = (rec.l || 0) + 1;
      rec.e = Math.max(1.3, (rec.e || 2.5) - 0.20);
      rec.n = Math.max(1, (rec.n || 0) - 1);           /* step back, do not reset */
      rec.i = Math.max(1, Math.round((rec.i || 1) * LAPSE_KEEP));
      rec.r = 1;                                        /* relearning */
      rec.d = t;                                        /* still relearn in this session */
      return rec;
    }
    rec.n = (rec.n || 0) + 1;
    if (grade === 1)      rec.e = Math.max(1.3, (rec.e || 2.5) - 0.15);
    else if (grade === 3) rec.e = Math.min(3.2, (rec.e || 2.5) + 0.10);
    rec.e = rec.e + (EASE_TARGET - rec.e) * EASE_REVERT;
    rec.e = Math.max(1.3, Math.min(3.2, rec.e));
    if (rec.r) {
      /* First success after a lapse re-establishes the reduced interval; it does
         not immediately multiply it by the ease again, which would hand a card
         you have just forgotten a longer gap than one you never missed. */
      rec.r = 0;
      rec.i = Math.max(1, Math.round((rec.i || 1) * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1)));
      rec.i = Math.max(1, Math.min(365, rec.i));
      rec.d = t + rec.i;
      return rec;
    }
    if (rec.n === 1)      rec.i = Math.max(rec.i || 0, grade === 1 ? 1 : (grade === 3 ? 3 : 1));
    else if (rec.n === 2) rec.i = Math.max(rec.i || 0, grade === 1 ? 3 : (grade === 3 ? 8 : 6));
    else                  rec.i = Math.round((rec.i || 1) * (grade === 1 ? 1.2 : rec.e) * (grade === 3 ? 1.15 : 1));
    rec.i = Math.max(1, Math.min(365, rec.i));
    rec.d = t + rec.i;
    return rec;
  }

  /* ---------- deck ---------- */
  var DECK = window.__CARDS__ || [];
  var byId = {};
  DECK.forEach(function (c) { byId[c.i] = c; });

  function cardState(id) { return readState().cards[id] || null; }
  function isDue(id)  { var r = cardState(id); return !r || r.d <= today(); }
  function isNew(id)  { return !cardState(id); }
  function isMature(id) { var r = cardState(id); return !!r && r.i >= 21; }

  function volCounts() {
    var out = {};
    DECK.forEach(function (c) {
      var o = out[c.v] || (out[c.v] = { total: 0, due: 0, fresh: 0, mature: 0, seen: 0 });
      o.total++;
      if (isNew(c.i)) { o.fresh++; o.due++; }
      else { o.seen++; if (isDue(c.i)) o.due++; if (isMature(c.i)) o.mature++; }
    });
    return out;
  }

  function buildQueue(filterVol) {
    var st = readState(), t = today();
    var pool = DECK.filter(function (c) { return !filterVol || c.v === filterVol; });
    var review = [], fresh = [];
    pool.forEach(function (c) {
      var r = st.cards[c.i];
      if (!r) fresh.push(c);
      else if (r.d <= t) review.push(c);
    });
    // Reviews are SHUFFLED across volumes on purpose: blocked practice by topic
    // feels easier and retains worse (00.2). New cards are NOT shuffled --
    // introducing a Volume 25A card on day one, before that volume has been
    // read, teaches nothing. New cards follow reading order, with volumes the
    // reader has actually started promoted ahead of the rest.
    shuffle(review);
    var started = {};
    Object.keys(st.done).forEach(function (secId) {
      var el = document.getElementById(secId);
      var sec = el && el.closest ? el.closest("section.vol") : null;
      var a = sec ? document.querySelector('.nav-item[href="#' + sec.id + '"] .n') : null;
      if (a) started[a.textContent.trim()] = 1;
    });
    var order = {};
    DECK.forEach(function (c, k) { order[c.i] = k; });
    fresh.sort(function (a, b) {
      var pa = started[a.v] ? 0 : 1, pb = started[b.v] ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return order[a.i] - order[b.i];
    });
    var nNew = filterVol ? fresh.length : Math.min(fresh.length, st.opt.newPerDay);
    var q = review.concat(fresh.slice(0, nNew));
    return q.slice(0, filterVol ? q.length : st.opt.maxPerDay);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* ---------- review panel ---------- */
  var queue = [], qi = 0, revealed = false, sessionStats = { seen: 0, again: 0 };

  function openReview(vol) {
    queue = buildQueue(vol || null); qi = 0; revealed = false;
    sessionStats = { seen: 0, again: 0 };
    var p = $("#review");
    if (!p) return;
    p.classList.add("on");
    p.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderCard();
  }
  function closeReview() {
    var p = $("#review");
    if (!p) return;
    p.classList.remove("on");
    p.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    renderDash(); renderNavBadges();
  }

  function renderCard() {
    var box = $("#rvBody"), foot = $("#rvFoot"), prog = $("#rvProg");
    if (!box) return;
    if (qi >= queue.length) {
      box.innerHTML = '<div class="rv-done"><div class="rv-done-h">Session complete</div>'
        + '<p>' + sessionStats.seen + ' card' + (sessionStats.seen === 1 ? '' : 's') + ' reviewed'
        + (sessionStats.again ? ', ' + sessionStats.again + ' marked <b>Again</b> and queued for today'
                              : ', none failed') + '.</p>'
        + '<p class="rv-hint">Come back tomorrow. The interval between reviews is doing the work; '
        + 'reviewing the same card twice today adds almost nothing.</p></div>';
      foot.innerHTML = '<button class="rv-b rv-b-wide" data-rv="close">Close</button>';
      prog.style.width = "100%";
      return;
    }
    var c = queue[qi];
    prog.style.width = (qi / queue.length * 100).toFixed(1) + "%";
    var st = cardState(c.i);
    var tag = st ? (st.i >= 21 ? "mature" : "learning") : "new";
    box.innerHTML =
      '<div class="rv-meta"><span class="rv-vol">Vol ' + esc(c.v) + '</span>'
      + '<span class="rv-tag rv-' + tag + '">' + tag + '</span>'
      + (c.s ? '<a class="rv-src" href="#' + esc(c.s) + '" data-rv="goto">source &rarr;</a>' : '')
      + '</div>'
      + '<div class="rv-q">' + c.q + '</div>'
      + (revealed ? '<div class="rv-a">' + c.a + '</div>' : '<div class="rv-veil">Answer hidden &mdash; '
         + 'try to produce it before revealing. The effort is the mechanism.</div>');
    foot.innerHTML = revealed
      ? '<button class="rv-b rv-again" data-g="0">Again<kbd>1</kbd></button>'
      + '<button class="rv-b" data-g="1">Hard<kbd>2</kbd></button>'
      + '<button class="rv-b rv-good" data-g="2">Good<kbd>3</kbd></button>'
      + '<button class="rv-b" data-g="3">Easy<kbd>4</kbd></button>'
      : '<button class="rv-b rv-b-wide" data-rv="reveal">Reveal<kbd>space</kbd></button>';
  }

  function grade(g) {
    if (qi >= queue.length) return;
    var c = queue[qi], st = readState();
    st.cards[c.i] = schedule(st.cards[c.i], g);
    var t = today();
    var last = st.log[st.log.length - 1];
    if (!last || last[0] !== t) st.log.push([t, 0, 0]);
    last = st.log[st.log.length - 1];
    last[1]++; if (g > 0) last[2]++;
    if (st.log.length > 400) st.log = st.log.slice(-400);
    writeState();
    sessionStats.seen++;
    if (g === 0) { sessionStats.again++; queue.push(c); }   // requeue at the end
    qi++; revealed = false; renderCard();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-rv],[data-g],[data-study]") : null;
    if (!t) return;
    if (t.hasAttribute("data-g")) { grade(parseInt(t.getAttribute("data-g"), 10)); return; }
    var a = t.getAttribute("data-rv") || t.getAttribute("data-study");
    if (a === "reveal") { revealed = true; renderCard(); }
    else if (a === "close") closeReview();
    else if (a === "goto")  { closeReview(); }
    else if (a === "open")  { e.preventDefault(); openReview(t.getAttribute("data-vol") || null); }
    else if (a === "reset-vol") {
      var v = t.getAttribute("data-vol");
      window.__QC_ASK__("Reset scheduling for every card in Volume " + v + "?").then(function (ok) {
        if (!ok) return;
        var st = readState();
        DECK.forEach(function (c) { if (c.v === v) delete st.cards[c.i]; });
        writeState(); renderDash(); renderNavBadges(); renderVolPanels();
      });
    }
  });

  document.addEventListener("keydown", function (e) {
    var p = $("#review");
    if (!p || !p.classList.contains("on")) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") { closeReview(); return; }
    if (!revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); revealed = true; renderCard(); return; }
    if (revealed && ["1", "2", "3", "4"].indexOf(e.key) >= 0) { e.preventDefault(); grade(parseInt(e.key, 10) - 1); }
    if (revealed && e.key === " ") { e.preventDefault(); grade(2); }
  });

  /* ---------- section completion ---------- */
  function markSection(id, on) {
    var st = readState();
    if (on) st.done[id] = today(); else delete st.done[id];
    writeState();
  }
  function sectionDone(id) { return !!readState().done[id]; }

  function attachSectionChecks() {
    $$("h3.sh").forEach(function (h) {
      if (!h.id || h.querySelector(".sec-check")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sec-check";
      b.setAttribute("aria-label", "Mark this section as understood");
      b.setAttribute("title", "Mark as understood");
      var sync = function () {
        var on = sectionDone(h.id);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        b.innerHTML = on ? "&#10003;" : "";
      };
      b.addEventListener("click", function () {
        markSection(h.id, !sectionDone(h.id));
        sync(); renderDash(); renderNavBadges();
      });
      sync();
      h.insertBefore(b, h.firstChild);
    });
  }

  /* ---------- per-volume recall panels ---------- */
  function renderVolPanels() {
    var counts = volCounts();
    $$("[data-recall]").forEach(function (el) {
      var v = el.getAttribute("data-recall");
      var c = counts[v] || { total: 0, due: 0, fresh: 0, mature: 0, seen: 0 };
      var pct = c.total ? Math.round(c.mature / c.total * 100) : 0;
      el.innerHTML =
        '<div class="rc-h">Retrieval practice &mdash; Volume ' + esc(v) + '</div>'
        + '<div class="rc-body">'
        + '<div class="rc-stats">'
        +   '<div class="rc-s"><b>' + c.total + '</b><span>cards</span></div>'
        +   '<div class="rc-s"><b class="' + (c.due ? "rc-hot" : "") + '">' + c.due + '</b><span>due now</span></div>'
        +   '<div class="rc-s"><b>' + c.mature + '</b><span>mature</span></div>'
        +   '<div class="rc-s"><b>' + pct + '%</b><span>consolidated</span></div>'
        + '</div>'
        + '<div class="rc-bar"><i style="width:' + pct + '%"></i></div>'
        + '<div class="rc-act">'
        +   '<button class="btn-study" data-study="open" data-vol="' + esc(v) + '">'
        +     (c.due ? 'Review ' + c.due + ' card' + (c.due === 1 ? '' : 's') : 'Practise all ' + c.total) + '</button>'
        +   (c.seen ? '<button class="btn-plain" data-study="reset-vol" data-vol="' + esc(v) + '">Reset</button>' : '')
        + '</div>'
        + '<p class="rc-note">Answer out loud or on paper <em>before</em> revealing. Recognising an answer '
        + 'you have just read is not the same operation as producing it, and only the second one predicts '
        + 'whether you will have it in an interview or at 3&nbsp;a.m. during a drawdown.</p>'
        + '</div>';
    });
  }

  /* ---------- nav badges ---------- */
  function renderNavBadges() {
    var counts = volCounts();
    var st = readState();
    $$(".nav-item").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var vid = href.slice(1);
      var sec = document.getElementById(vid);
      var b = a.querySelector(".nav-badge");
      if (!b) { b = document.createElement("span"); b.className = "nav-badge"; a.appendChild(b); }
      var vol = a.querySelector(".n") ? a.querySelector(".n").textContent.trim() : "";
      var c = counts[vol];
      var heads = sec ? $$("h3.sh", sec) : [];
      var done = heads.filter(function (h) { return st.done[h.id]; }).length;
      var parts = [];
      if (heads.length && done) parts.push('<i class="nb-done">' + done + '/' + heads.length + '</i>');
      if (c && c.due) parts.push('<i class="nb-due">' + c.due + '</i>');
      b.innerHTML = parts.join("");
    });
    try { document.dispatchEvent(new CustomEvent("qr:study")); } catch (e) {}
  }

  /* ---------- dashboard ---------- */
  function renderDash() {
    var el = $("#dash");
    if (!el) return;
    var st = readState(), counts = volCounts(), t = today();
    var total = DECK.length, mature = 0, seen = 0, backlog = 0, fresh = 0;
    DECK.forEach(function (c) {
      if (isNew(c.i)) { fresh++; }
      else { seen++; if (isDue(c.i)) backlog++; if (isMature(c.i)) mature++; }
    });
    // Report what today's session will ACTUALLY serve, not the whole unseen
    // deck. A counter reading 246 on day one is both wrong and discouraging;
    // the queue caps new cards per day, so that is the honest number.
    var due = buildQueue(null).length;
    var heads = $$("h3.sh"), doneN = heads.filter(function (h) { return st.done[h.id]; }).length;

    // 30-day activity
    var byDay = {};
    st.log.forEach(function (r) { byDay[r[0]] = r[1]; });
    var spark = [], maxv = 1;
    for (var d = t - 29; d <= t; d++) { var v = byDay[d] || 0; spark.push(v); if (v > maxv) maxv = v; }
    var streak = 0;
    for (var k = t; k >= t - 400; k--) { if (byDay[k]) streak++; else if (k !== t) break; }

    var W = 300, H = 40, bw = W / 30;
    var bars = spark.map(function (v, i) {
      var hgt = v ? Math.max(2, v / maxv * H) : 0;
      return '<rect x="' + (i * bw).toFixed(1) + '" y="' + (H - hgt).toFixed(1)
           + '" width="' + (bw - 1.4).toFixed(1) + '" height="' + hgt.toFixed(1)
           + '" rx="1" class="' + (v ? 'sp-on' : 'sp-off') + '"></rect>';
    }).join("");

    var gates = Object.keys(st.gate).map(function (g) {
      var r = st.gate[g];
      return '<li><b>' + esc(g) + '</b> &mdash; ' + r.score + '/' + r.total + '</li>';
    }).join("");

    el.innerHTML =
      '<div class="dash-grid">'
      + statCard(due, backlog ? "due today (" + backlog + " overdue)" : "due today", due ? "dash-hot" : "")
      + statCard(mature + " / " + total, fresh ? "consolidated (" + fresh + " unseen)" : "consolidated")
      + statCard(doneN + " / " + heads.length, "sections marked")
      + statCard(streak, "day streak")
      + '</div>'
      + '<div class="dash-act">'
      +   '<button class="btn-study btn-lg" data-study="open">'
      +     (due ? 'Start review &mdash; ' + due + ' card' + (due === 1 ? '' : 's') : 'Nothing due. Practise anyway')
      +   '</button>'
      +   '<button class="btn-plain" id="dashExport">Export progress</button>'
      +   '<label class="btn-plain" for="dashImport">Import<input type="file" id="dashImport" accept="application/json" hidden></label>'
      + '</div>'
      + '<div class="dash-spark"><div class="ds-h">Reviews, last 30 days</div>'
      +   '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" '
      +   'aria-label="Daily review counts over the last thirty days">' + bars + '</svg></div>'
      + (gates ? '<div class="dash-gates"><div class="ds-h">Gate results</div><ul>' + gates + '</ul></div>' : '')
      + (storageOK ? '' : '<p class="dash-warn">Browser storage is unavailable here, so progress will not '
          + 'survive a reload. Everything else works; use <b>Export progress</b> if you want to keep a record.</p>');

    var ex = $("#dashExport");
    if (ex) ex.addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(readState())], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "quant-reference-progress.json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    var im = $("#dashImport");
    if (im) im.addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = JSON.parse(r.result);
          if (!s || !s.cards) throw new Error("not a progress file");
          memFallback = s; writeState();
          renderDash(); renderNavBadges(); renderVolPanels(); attachSectionChecks();
          $$("h3.sh").forEach(function (h) {
            var b = h.querySelector(".sec-check");
            if (b) { var on = sectionDone(h.id); b.classList.toggle("on", on); b.innerHTML = on ? "&#10003;" : ""; }
          });
        } catch (e) { window.alert("Could not read that file: " + e.message); }
      };
      r.readAsText(f);
    });
  }
  function statCard(v, k, cls) {
    return '<div class="dash-s ' + (cls || "") + '"><b>' + v + '</b><span>' + k + '</span></div>';
  }

  /* ---------- scored gates ---------- */
  function attachGates() {
    $$("[data-gate]").forEach(function (g) {
      if (g.dataset.wired) return;
      g.dataset.wired = "1";
      var name = g.getAttribute("data-gate");
      var items = $$(".gate-q", g);
      var out = $(".gate-out", g);
      var btn = $(".gate-score", g);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var got = items.filter(function (it) { return $("input", it) && $("input", it).checked; }).length;
        var st = readState();
        st.gate[name] = { score: got, total: items.length, at: today() };
        writeState(); renderDash();
        var pct = items.length ? got / items.length : 0;
        var verdict = pct >= 0.75
          ? "<b>Proceed.</b> You have the working set this volume was built to give you."
          : (pct >= 0.5
            ? "<b>Revisit the ones you missed</b> before moving on. Partial is the usual first-pass result and says nothing about capacity."
            : "<b>Work through the volume again.</b> This is a normal first-pass outcome, and going back now is the fast route rather than the slow one.");
        out.innerHTML = '<div class="gate-res"><span class="gate-num">' + got + ' / ' + items.length
          + '</span><p>' + verdict + '</p></div>';
        out.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
  }

  /* ---------- self-check reveals (inline, not scheduled) ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-reveal]") : null;
    if (!b) return;
    var box = b.closest(".selfcheck");
    if (!box) return;
    var a = $(".sc-a", box);
    var open = box.classList.toggle("open");
    b.textContent = open ? "Hide" : "Show answer";
    if (a) a.setAttribute("aria-hidden", String(!open));
  });

  /* ---------- boot ---------- */
  function boot() {
    readState();
    attachSectionChecks();
    renderVolPanels();
    renderNavBadges();
    renderDash();
    attachGates();
    if (window.__CALC__) window.__CALC__.init();
    var t = $("#studyBtn");
    if (t) t.addEventListener("click", function () { openReview(null); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__STUDY__ = { open: openReview, state: readState, schedule: schedule, deck: DECK,
                       due: function () { return buildQueue(null).length; } };
})();
;
/* ============================================================
   QUANT REFERENCE — interactive calculators
   ============================================================ */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- numerics ---------- */
  function Phi(x) {
    /* Hart's algorithm, in the form given by West (2005). Accurate to about
       1e-15 across the whole range, where the Abramowitz & Stegun series it
       replaces was good to 1.5e-7 -- which is coarser than the tolerance some
       of these numbers are read to. */
    var a = Math.abs(x), c;
    if (a > 37) { c = 0; }
    else {
      var e = Math.exp(-a * a / 2), b, d;
      if (a < 7.07106781186547) {
        b = 3.52624965998911e-02 * a + 0.700383064443688;
        b = b * a + 6.37396220353165;
        b = b * a + 33.912866078383;
        b = b * a + 112.079291497871;
        b = b * a + 221.213596169931;
        b = b * a + 220.206867912376;
        d = 8.83883476483184e-02 * a + 1.75566716318264;
        d = d * a + 16.064177579207;
        d = d * a + 86.7807322029461;
        d = d * a + 296.564248779674;
        d = d * a + 637.333633378831;
        d = d * a + 793.826512519948;
        d = d * a + 440.413735824752;
        c = e * b / d;
      } else {
        d = a + 0.65;
        d = a + 4 / d;
        d = a + 3 / d;
        d = a + 2 / d;
        d = a + 1 / d;
        c = e / (d * 2.506628274631);
      }
    }
    return x > 0 ? 1 - c : c;
  }
  function erf(x) { return 2 * Phi(x * Math.SQRT2) - 1; }
  function lgamma(x) {                                // Lanczos
    var g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
             -176.61502916214059, 12.507343278686905, -0.13857109526572012,
             9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; var a = 0.99999999999980993, t = x + 7.5;
    for (var i = 0; i < 8; i++) a += g[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {                          // Lentz continued fraction
    var MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a
                                     : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function tcdf(t, v) {                               // Student-t CDF
    var x = v / (v + t * t), p = 0.5 * betai(v / 2, 0.5, x);
    return t > 0 ? 1 - p : p;
  }
  function fmt(x, d) {
    if (!isFinite(x)) return "&infin;";
    d = d === undefined ? 2 : d;
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money(x) {
    var a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "bn";
    if (a >= 1e6) return (x / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "m";
    if (a >= 1e3) return (x / 1e3).toFixed(0) + "k";
    return x.toFixed(0);
  }
  function pct(x, d) { return fmt(x * 100, d === undefined ? 1 : d) + "%"; }

  /* small inline bar: value in [0,1] */
  function meter(v, label, tone) {
    v = Math.max(0, Math.min(1, v));
    return '<div class="cm"><div class="cm-l">' + label + '</div>'
         + '<div class="cm-t"><i class="' + (tone || "") + '" style="width:' + (v * 100).toFixed(1) + '%"></i></div></div>';
  }
  function row(k, v, tone) {
    return '<div class="cr ' + (tone || "") + '"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function verdict(txt, tone) { return '<div class="cv ' + (tone || "") + '">' + txt + '</div>'; }

  /* ---------- the calculators ---------- */
  var FN = {};

  FN.drag = function (p) {
    var mu = p.mu / 100, sd = p.sd / 100, yrs = p.yrs;
    var g = mu - 0.5 * sd * sd;
    /* Both growth figures must compound the same way or the comparison is
       meaningless: g is the geometric mean in simple-return space, so it
       compounds as (1+g)^T exactly as the arithmetic mean does. */
    var arith = Math.pow(1 + mu, yrs), geo = Math.pow(1 + g, yrs);
    return row("Arithmetic mean return", pct(mu))
         + row("Volatility drag &minus;&sigma;&sup2;/2", pct(-0.5 * sd * sd), "neg")
         + row("Geometric (compounded) return", pct(g), g > 0 ? "pos" : "neg")
         + row("Growth of 1 over " + yrs + " years", "&times;" + fmt(geo, 2))
         + row("If drag did not exist", "&times;" + fmt(arith, 2), "muted")
         + verdict(sd * sd / 2 >= mu
            ? "<b>Volatility has eaten the entire edge.</b> At this volatility the median outcome is a loss even though the average return is positive. This is not a pathology &mdash; it is arithmetic, and it is why leverage has an optimum rather than being monotonically good."
            : "Drag costs you " + pct(0.5 * sd * sd) + " a year. Halving volatility while keeping the same arithmetic mean would add " + pct(0.5 * sd * sd * 0.75) + " to compounded return &mdash; which is the entire argument for volatility targeting.",
            sd * sd / 2 >= mu ? "bad" : "");
  };

  FN.bayes = function (p) {
    var prior = p.prior / 100, power = p.power / 100, size = p.size / 100, n = p.n;
    var post = power * prior / (power * prior + size * (1 - prior));
    // with n independent tests, expected false positives vs true positives
    var tp = n * prior * power, fp = n * (1 - prior) * size;
    var postN = tp / Math.max(tp + fp, 1e-12);
    return row("P(real | passes), one test", pct(post), post < 0.5 ? "neg" : "pos")
         + row("Expected true positives in " + n + " tests", fmt(tp, 1))
         + row("Expected false positives", fmt(fp, 1), "neg")
         + row("P(real | passes), after " + n + " tests", pct(postN), postN < 0.5 ? "neg" : "pos")
         + meter(postN, "Share of survivors that are real", postN < 0.4 ? "bad" : (postN > 0.7 ? "good" : ""))
         + verdict(postN < 0.5
            ? "<b>Most of what passes is noise.</b> Not because the test is bad &mdash; " + pct(power, 0) + " power and " + pct(size, 0) + " size is a decent test &mdash; but because the prior is low and you ran " + n + " of them. Lower the size, or raise the prior by having a reason to test the idea at all."
            : "Majority of survivors are real. Note how fast this degrades if you raise the number of tests.",
            postN < 0.5 ? "bad" : "good");
  };

  FN.divfloor = function (p) {
    var sd = p.sd / 100, rho = p.rho, n = p.n;
    var v = sd * sd * (rho + (1 - rho) / n);
    var floor = sd * Math.sqrt(Math.max(rho, 0));
    var pts = [];
    for (var k = 1; k <= 60; k++) pts.push(sd * Math.sqrt(rho + (1 - rho) / k));
    var W = 320, H = 78, mx = sd;
    var path = pts.map(function (y, i) {
      return (i ? "L" : "M") + (i / 59 * W).toFixed(1) + " " + (H - y / mx * H).toFixed(1);
    }).join("");
    var fy = H - floor / mx * H;
    return row("Portfolio volatility with " + n + " assets", pct(Math.sqrt(v)))
         + row("Floor as n &rarr; &infin;", pct(floor), "muted")
         + row("Fraction of the way to the floor", pct((sd - Math.sqrt(v)) / Math.max(sd - floor, 1e-9)))
         + '<svg class="cchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Portfolio volatility falling with the number of assets, flattening at a floor set by correlation">'
         + '<line x1="0" y1="' + fy.toFixed(1) + '" x2="' + W + '" y2="' + fy.toFixed(1) + '" class="c-ref"></line>'
         + '<path d="' + path + '" class="c-line"></path></svg>'
         + '<div class="cchart-x"><span>1 asset</span><span>60 assets</span></div>'
         + verdict("Diversification stops at " + pct(floor) + ", not at zero. Beyond about " +
            (rho > 0.02 ? Math.ceil(2 / rho / 10) * 10 : 60) + " names you are paying costs for nothing. "
            + "And the floor <em>is</em> correlation &mdash; which rises exactly when you need the diversification.");
  };

  FN.sharpe = function (p) {
    var sr = p.sr, yrs = p.yrs, q = 252;
    // Lo (2002): Var(S_p) = (1 + S_p^2/2)/n for the PER-PERIOD Sharpe over n
    // observations. Converting to annualised units with n = q*T and
    // S_p = SR/sqrt(q) gives Var(SR) = (1 + SR^2/(2q))/T -- which is very
    // close to 1/T, and reproduces the exact identity t = SR*sqrt(T).
    var se = Math.sqrt((1 + sr * sr / (2 * q)) / yrs);
    var t = sr * Math.sqrt(yrs);
    var lo = sr - 1.96 * se, hi = sr + 1.96 * se;
    var pLoseYear = Phi(-sr);
    var pLoseDay = Phi(-sr / Math.sqrt(252));
    var yrsNeeded = sr > 0 ? Math.pow(2 / sr, 2) : Infinity;   // t = SR*sqrt(T) = 2
    return row("t-statistic", fmt(t, 2), t >= 3 ? "pos" : (t < 2 ? "neg" : ""))
         + row("Standard error of the estimate", "&plusmn;" + fmt(se, 2))
         + row("95% interval for the true Sharpe", fmt(lo, 2) + " to " + fmt(hi, 2), lo <= 0 ? "neg" : "")
         + row("P(a losing year)", pct(pLoseYear))
         + row("P(a losing day)", pct(pLoseDay))
         + row("Years to reach t = 2", isFinite(yrsNeeded) ? fmt(yrsNeeded, 1) : "&infin;")
         + verdict(t < 2
            ? "<b>This is not evidence yet.</b> A Sharpe of " + fmt(sr, 2) + " over " + fmt(yrs, 1) + " years gives t = " + fmt(t, 2) + ", and the interval includes values you would not trade. Before adjusting for how many strategies you tried."
            : (t < 3 ? "Borderline. t = " + fmt(t, 2) + " clears the conventional bar for a single pre-registered test and fails it the moment you account for having looked at more than one strategy."
                     : "<b>Real evidence</b> for a single test. Now divide the threshold by the number of variants you tried &mdash; see the deflated Sharpe calculator in Volume&nbsp;18."),
            t < 2 ? "bad" : (t < 3 ? "" : "good"));
  };

  FN.mp = function (p) {
    var n = p.n, T = p.T;
    var q = n / T;
    var lp = Math.pow(1 + Math.sqrt(q), 2), lm = Math.pow(1 - Math.sqrt(q), 2);
    var singular = n > T;
    var spread = lp / Math.max(lm, 1e-12);
    return row("q = n / T", fmt(q, 3))
         + row("&lambda;<sub>+</sub> (noise upper edge)", fmt(lp, 2))
         + row("&lambda;<sub>&minus;</sub> (noise lower edge)", singular ? "0 (singular)" : fmt(lm, 3), singular ? "neg" : "")
         + row("Noise eigenvalue spread", singular ? "&infin;" : "&times;" + fmt(spread, 0), spread > 20 ? "neg" : "")
         + row("Amplification of the worst direction on inversion", singular ? "&infin;" : "&times;" + fmt(1 / lm, 1), "neg")
         + verdict(singular
            ? "<b>The sample covariance is exactly singular</b> and has no inverse. " + n + " assets need more than " + n + " observations merely to be invertible &mdash; and the correlation structure that long ago is not today's. Use a factor model or shrink."
            : (q > 0.2
              ? "<b>Most of this spectrum is noise.</b> Pure noise alone would produce eigenvalues varying by a factor of " + fmt(spread, 0) + ". Every one of those will look like a nameable component. Clip the bulk (11A.2) before inverting."
              : "Comfortable. Enough observations per asset that the top of the spectrum is meaningful. Still shrink."),
            singular || q > 0.2 ? "bad" : "good");
  };

  FN.impact = function (p) {
    var adv = p.adv * 1e6, part = p.part / 100, sd = p.sd / 100, Y = p.Y, d = p.d;
    var qty = adv * part;
    var one = Y * sd * Math.pow(part, d);
    var rt = 2 * one;
    var costCur = qty * rt;
    var linear = Y * sd * part;
    return row("Order size", "$" + money(qty))
         + row("Participation rate", pct(part))
         + row("Impact, one way", fmt(one * 1e4, 1) + " bp")
         + row("Round trip", fmt(rt * 1e4, 1) + " bp", "neg")
         + row("Cost of the round trip", "$" + money(costCur), "neg")
         + row("What a LINEAR model would have said", fmt(2 * linear * 1e4, 1) + " bp", "muted")
         + verdict("Doubling the order multiplies impact by " + fmt(Math.pow(2, d), 2) + "&times;, not 2&times;. "
            + "That concavity is why large orders are cheaper per share than a linear model predicts &mdash; and "
            + "why assuming linearity makes a viable strategy look uninvestable at size. The exponent is the whole story: "
            + "set it to 1 and you get the linear number in grey.");
  };

  FN.capacity = function (p) {
    var alpha = p.alpha / 100, turn = p.turn, advm = p.advm * 1e6, w = p.w / 100,
        conc = p.conc, sd = p.sd / 100, Y = 0.5, d = 0.5;
    /* part is the position expressed in days of that name's volume, which is
       what the square-root law takes: impact = Y * sigma_daily * sqrt(Q/ADV).
       Annual cost is then simply turnover times that one-way impact -- there
       is no annualisation of the volatility, and multiplying it by sqrt(252)
       here (as an earlier draft did) inflated cost sixteenfold and put
       capacity two orders of magnitude below the table above. */
    function net(A) {
      var part = (A * w * conc) / advm;
      var cost = turn * Y * sd * Math.pow(Math.max(part, 1e-12), d);
      return alpha - cost;
    }
    function daysOfVolume(A) { return (A * w * conc) / advm; }
    var lo = 1e5, hi = 1e12, cap = 0;
    if (net(lo) <= 0) cap = 0;
    else {
      for (var k = 0; k < 80; k++) { var mid = Math.sqrt(lo * hi); if (net(mid) > 0) lo = mid; else hi = mid; }
      cap = lo;
    }
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var A = 1e6 * Math.pow(10, i / 40 * 4);
      pts.push([i / 40, net(A)]);
    }
    var mx = Math.max.apply(null, pts.map(function (x) { return x[1]; }));
    var mn = Math.min.apply(null, pts.map(function (x) { return x[1]; }));
    var W = 320, H = 78, z = (mx - 0) / (mx - mn) * H;
    var path = pts.map(function (pt, i) {
      return (i ? "L" : "M") + (pt[0] * W).toFixed(1) + " " + (H - (pt[1] - mn) / (mx - mn) * H).toFixed(1);
    }).join("");
    var dv = cap ? daysOfVolume(cap) : 0;
    return row("Gross alpha", pct(alpha))
         + row("Net alpha at $10m", pct(net(1e7)), net(1e7) > 0 ? "pos" : "neg")
         + row("Net alpha at $100m", pct(net(1e8)), net(1e8) > 0 ? "pos" : "neg")
         + row("Capacity (net alpha &rarr; 0)", cap ? "$" + money(cap) : "below $100k &mdash; not viable", cap ? "" : "neg")
         + row("One position there, in days of that name&rsquo;s volume", cap ? fmt(dv, 2) + " days" : "&mdash;", dv > 1 ? "neg" : "")
         + '<svg class="cchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Net alpha declining as assets under management rise, crossing zero at capacity">'
         + '<line x1="0" y1="' + z.toFixed(1) + '" x2="' + W + '" y2="' + z.toFixed(1) + '" class="c-ref"></line>'
         + '<path d="' + path + '" class="c-line"></path></svg>'
         + '<div class="cchart-x"><span>$1m</span><span>$10bn</span></div>'
         + verdict(
            (dv > 1
              ? "<b>Read this one with suspicion.</b> At capacity a single position is " + fmt(dv, 2)
                + " days of that name&rsquo;s entire volume, and the square-root law is being extrapolated well past "
                + "the range it was fitted on &mdash; real impact there is worse than this, so treat the number as a "
                + "ceiling rather than an estimate. Lower the position weight or raise the volume to bring it back "
                + "inside one day. "
              : "At capacity a single position is " + fmt(dv, 2) + " days of that name&rsquo;s volume, which is inside "
                + "the range the square-root law was fitted on. ")
            + "Capacity and Sharpe trade off almost mechanically. "
            + (cap && cap < 1e8
              ? "A capacity of $" + money(cap) + " is invisible to a $2bn fund &mdash; not because they cannot find "
                + "it, but because deploying that little is not worth their overhead. <b>That is the region left "
                + "uncontested for you.</b>"
              : "A capacity of $" + money(cap) + " is institutional territory, which means the competition for it is "
                + "the best-resourced there is. <b>Cut the gross alpha assumption in half and look again</b> &mdash; "
                + "capacity falls with the square of it, and the uncontested region is the one below $100m."),
            dv > 1 ? "bad" : "");
  };

  FN.kelly = function (p) {
    var mu = p.mu / 100, sd = p.sd / 100, frac = p.frac / 100;
    var kelly = mu / (sd * sd);
    var used = kelly * frac;
    var gFull = mu * kelly - 0.5 * sd * sd * kelly * kelly;
    var gUsed = mu * used - 0.5 * sd * sd * used * used;
    var gDouble = mu * 2 * kelly - 0.5 * sd * sd * Math.pow(2 * kelly, 2);
    var volUsed = used * sd;
    return row("Full-Kelly leverage &mu;/&sigma;&sup2;", "&times;" + fmt(kelly, 2))
         + row("Leverage at " + pct(frac, 0) + " Kelly", "&times;" + fmt(used, 2))
         + row("Portfolio volatility there", pct(volUsed))
         + row("Growth rate, full Kelly", pct(gFull))
         + row("Growth rate at " + pct(frac, 0) + " Kelly", pct(gUsed))
         + row("Growth rate at DOUBLE Kelly", pct(gDouble), gDouble <= 0 ? "neg" : "")
         + meter(gUsed / Math.max(gFull, 1e-9), "Growth retained", "good")
         + verdict("At " + pct(frac, 0) + " Kelly you keep " + pct(gUsed / Math.max(gFull, 1e-9), 0)
            + " of the growth rate for " + pct(frac, 0) + " of the volatility. <b>Double Kelly has a growth rate of zero.</b> "
            + "The curve is flat near the optimum and falls off a cliff past it, so every error you make should be "
            + "on the low side &mdash; and your estimate of &mu; is far noisier than your estimate of &sigma;.");
  };

  FN.dd = function (p) {
    var sr = p.sr, yrs = p.yrs;
    var pDown = Phi(-sr / Math.sqrt(252));
    // Magdon-Ismail approximation for expected max drawdown of a Brownian motion
    // with drift, normalised: E[MDD] ~ (sigma^2 / (2 mu)) * f(mu^2 T / sigma^2).
    var sd = 1.0, mu = sr;                      // unit-vol convention
    var x = mu * mu * yrs / (sd * sd);
    var Qp = 0.63519 + 0.5 * Math.log(Math.max(x, 1e-9)) + 0.1 * Math.pow(Math.max(x, 1e-9), -1);
    var expMaxDD = (sd * sd / (2 * mu)) * Qp;
    var underwater = sr > 0 ? Math.max(0.35, Math.min(0.92, 1 - 0.28 * sr)) : 0.95;
    return row("P(a down day)", pct(pDown))
         + row("P(a down month)", pct(Phi(-sr / Math.sqrt(12))))
         + row("P(a down year)", pct(Phi(-sr)), "neg")
         + row("Expected worst drawdown over " + fmt(yrs, 0) + " years", pct(Math.min(expMaxDD, 0.95)) + " of vol-units", "neg")
         + row("Typical fraction of time below high-water mark", pct(underwater, 0), "neg")
         + meter(underwater, "Time spent underwater", "bad")
         + verdict("<b>A strategy working exactly as designed spends " + pct(underwater, 0)
            + " of its life below its high-water mark and loses money on " + pct(pDown, 0) + " of days.</b> "
            + "None of that is a malfunction. It is the base rate, and knowing the base rate is worth more than "
            + "resolve when you are in it &mdash; which is the entire argument for looking at P&amp;L monthly.");
  };

  FN.dsr = function (p) {
    var sr = p.sr, yrs = p.yrs, n = p.n, skew = p.skew, kurt = p.kurt;
    var N = yrs * 252;
    // expected maximum Sharpe under the null across n independent trials
    var g = 0.5772156649;
    var e1 = (1 - g) * Phi_inv(1 - 1 / n) + g * Phi_inv(1 - 1 / (n * Math.E));
    /* V[{SR_n}] is the spread of Sharpes ACROSS trials, not the sampling error
       of one of them. It is an input, not a constant, and it sets the whole bar. */
    var vsd = (p.vsd == null || !isFinite(p.vsd)) ? 1 : p.vsd;
    var srStar = e1 * vsd / Math.sqrt(252);    // per-period
    var srP = sr / Math.sqrt(252);
    var denom = Math.sqrt(Math.max(1e-12,
      (1 - skew * srP + (kurt - 1) / 4 * srP * srP) / (N - 1)));
    var z = (srP - srStar) / denom;
    var dsr = Phi(z);
    return row("Trials", String(n))
         + row("Assumed spread of Sharpes across trials", "&plusmn;" + fmt(vsd, 2), "muted")
         + row("Expected max Sharpe from noise alone", fmt(e1 * vsd, 2), "neg")
         + row("Your annualised Sharpe", fmt(sr, 2))
         + row("Deflated Sharpe (probability it is real)", pct(dsr), dsr < 0.9 ? "neg" : "pos")
         + meter(dsr, "Confidence the edge is real", dsr < 0.6 ? "bad" : (dsr > 0.9 ? "good" : ""))
         + verdict(dsr < 0.95
            ? "<b>Below the bar.</b> Searching " + n + " variants produces a best-of Sharpe of " + fmt(e1 * vsd, 2)
              + " from pure noise. Yours is " + fmt(sr, 2) + ". The honest threshold rises with every variant you "
              + "tried &mdash; including the ones you did not write down, which is why the trial counter has to be automatic."
            : "Clears the bar even after deflation for " + n + " trials. Note how quickly it falls if the trial count doubles.",
            dsr < 0.95 ? "bad" : "good");
  };
  function Phi_inv(p) {                          // Acklam's inverse normal
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
              1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
              6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  FN.tail = function (p) {
    var rho = p.rho, nu = p.nu;
    var arg = -Math.sqrt((nu + 1) * (1 - rho) / (1 + rho));
    var lam = 2 * tcdf(arg, nu + 1);
    return row("Correlation", fmt(rho, 2))
         + row("Gaussian copula tail dependence", "0.00", "neg")
         + row("Student-t (&nu; = " + nu + ") tail dependence", fmt(lam, 3), "pos")
         + row("Given one asset has a 1-in-1000 loss&hellip;", "&hellip;P(the other does too) &asymp; " + pct(lam, 1))
         + meter(lam, "Joint-crash probability", lam > 0.2 ? "bad" : "")
         + verdict("<b>The Gaussian copula says zero for every correlation below 1.</b> Not small &mdash; exactly zero. "
            + "At &rho; = " + fmt(rho, 2) + " and &nu; = " + nu + " the honest answer is " + pct(lam, 0)
            + ". If your risk system does not name its copula, it is Gaussian, and it is understating precisely "
            + "the scenario that ends funds.", lam > 0.15 ? "bad" : "");
  };

  FN.netret = function (p) {
    var gross = p.gross / 100, turn = p.turn, bps = p.bps, tax = p.tax / 100, yrs = p.yrs, bench = p.bench / 100;
    var cost = turn * bps / 1e4;
    var pre = gross - cost;
    var post = pre > 0 ? pre * (1 - tax) : pre;
    var g1 = Math.pow(1 + post, yrs);
    var gb = Math.pow(1 + bench * (1 - tax * 0.35), yrs);   // benchmark, mostly deferred
    return row("Gross return", pct(gross))
         + row("Trading cost (" + fmt(turn, 1) + "&times; turnover at " + bps + " bp)", "&minus;" + pct(cost), "neg")
         + row("Pre-tax net", pct(pre), pre > 0 ? "" : "neg")
         + row("After tax at " + pct(tax, 0), pct(post), post > 0 ? "" : "neg")
         + row("Growth of 1 over " + yrs + " years", "&times;" + fmt(g1, 2))
         + row("Passive benchmark, same period (tax mostly deferred)", "&times;" + fmt(gb, 2), "muted")
         + verdict(g1 <= gb
            ? "<b>The strategy loses to buy-and-hold after costs and tax.</b> Not because it has no edge &mdash; gross is "
              + pct(gross) + " &mdash; but because the edge is smaller than the combined drag. This calculation takes "
              + "twenty minutes and has ended more bad projects than any amount of backtesting rigour."
            : "Beats the benchmark by &times;" + fmt(g1 / gb, 2) + " over " + yrs + " years. Now halve the assumed gross "
              + "return, which is roughly what deflation for trial count will do to it, and look again.",
            g1 <= gb ? "bad" : "good");
  };

  FN.leak = function (p) {
    var sr = p.sr, lag = p.lag, half = p.half;
    // signal decays exponentially with half-life `half` bars; trading `lag` bars
    // late keeps exp(-ln2 * lag / half) of it
    var keep = Math.pow(0.5, lag / half);
    var realised = sr * keep;
    return row("Signal half-life", fmt(half, 1) + " bars")
         + row("Execution lag", fmt(lag, 1) + " bars")
         + row("Fraction of the signal that survives", pct(keep))
         + row("Backtest Sharpe (zero lag)", fmt(sr, 2), "muted")
         + row("Realised Sharpe", fmt(realised, 2), realised < sr * 0.6 ? "neg" : "")
         + meter(keep, "Alpha surviving the delay", keep < 0.5 ? "bad" : "good")
         + verdict(keep < 0.5
            ? "<b>More than half the edge is gone before you trade.</b> A backtest that fills at the same bar the "
              + "signal is computed on is not optimistic by a little. Shift the signal forward one bar and re-run: "
              + "if performance barely changes, you have a lookahead problem or no edge."
            : "The signal is slow enough to survive realistic execution. That is a structural advantage and it is why "
              + "low-turnover strategies are the ones an independent trader can actually run.",
            keep < 0.5 ? "bad" : "good");
  };

  /* ---------- wiring ---------- */
  function update(el) {
    var name = el.getAttribute("data-calc");
    var fn = FN[name];
    if (!fn) return;
    var vals = {};
    $$("input[data-k]", el).forEach(function (inp) {
      var v = parseFloat(inp.value);
      vals[inp.getAttribute("data-k")] = isNaN(v) ? 0 : v;
      var out = inp.parentNode.querySelector("output");
      if (out) {
        var suf = inp.getAttribute("data-suf") || "";
        var dec = parseInt(inp.getAttribute("data-dec") || "0", 10);
        out.textContent = v.toFixed(dec) + suf;
      }
    });
    var box = $(".calc-out", el);
    try { box.innerHTML = fn(vals); }
    catch (e) { box.innerHTML = '<div class="cv bad">Could not compute with these inputs.</div>'; }
  }

  function init() {
    $$(".calc").forEach(function (el) {
      $$("input[data-k]", el).forEach(function (inp) {
        inp.addEventListener("input", function () { update(el); });
      });
      var rs = $(".calc-reset", el);
      if (rs) rs.addEventListener("click", function () {
        $$("input[data-k]", el).forEach(function (inp) { inp.value = inp.getAttribute("data-def") || inp.value; });
        update(el);
      });
      update(el);
    });
  }

  window.__CALC__ = { init: init, FN: FN, Phi: Phi, tcdf: tcdf, Phi_inv: Phi_inv };
})();
;
/* ============================================================
   Inline definitions + the notation panel
   ============================================================ */
(function () {
  "use strict";
  var G = window.__GLOSS__ || {};
  var pop = null;

  function ensure() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "glpop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Definition");
    (document.getElementById("qr-root")||document.body).appendChild(pop);
    return pop;
  }
  function hide() { if (pop) pop.classList.remove("on"); }

  function show(el) {
    var key = el.getAttribute("data-gl");
    var e = G[key];
    if (!e) return;
    var p = ensure();
    p.innerHTML = '<button type="button" class="glpop-x" aria-label="Close">&times;</button>'
      + '<div class="glpop-t">' + e.t + '</div><div class="glpop-d">' + e.d + '</div>'
      + (e.r ? '<div class="glpop-r"><a href="#' + (e.vid || '') + '">Volume ' + e.r + ' covers this &rarr;</a></div>' : '');
    p.classList.add("on");
    var r = el.getBoundingClientRect();
    var pw = p.offsetWidth, ph = p.offsetHeight;
    var left = window.scrollX + r.left;
    if (left + pw > window.scrollX + document.documentElement.clientWidth - 12)
      left = window.scrollX + document.documentElement.clientWidth - pw - 12;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    var top = window.scrollY + r.bottom + 8;
    if (r.bottom + ph + 16 > window.innerHeight && r.top > ph + 16)
      top = window.scrollY + r.top - ph - 8;
    p.style.left = left + "px";
    p.style.top = top + "px";
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t.closest && t.closest(".glpop-x")) { hide(); return; }
    if (t.closest && t.closest(".glpop")) return;
    var g = t.closest ? t.closest(".gl") : null;
    if (g) { ev.preventDefault(); show(g); return; }
    hide();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { hide(); closeNotation(); }
    var g = ev.target && ev.target.classList && ev.target.classList.contains("gl");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); show(ev.target); }
  });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);

  /* ---- glossary volume filter ---- */
  function wireGlossary() {
    var box = document.getElementById("glSearch");
    if (!box) return;
    var items = Array.prototype.slice.call(document.querySelectorAll(".gl-e"));
    var count = document.getElementById("glCount");
    box.addEventListener("input", function () {
      var q = box.value.trim().toLowerCase();
      var n = 0;
      items.forEach(function (el) {
        var hit = !q || el.textContent.toLowerCase().indexOf(q) !== -1;
        el.classList.toggle("is-out", !hit);
        if (hit) n++;
      });
      if (count) count.textContent = n + " of " + items.length + " terms";
    });
  }

  /* ---- notation panel ---- */
  function closeNotation() {
    var n = document.getElementById("notation");
    if (n) { n.classList.remove("on"); n.setAttribute("aria-hidden", "true"); }
  }
  function wireNotation() {
    var btn = document.getElementById("notationBtn");
    var panel = document.getElementById("notation");
    if (!btn || !panel) return;
    btn.addEventListener("click", function () {
      var on = panel.classList.toggle("on");
      panel.setAttribute("aria-hidden", String(!on));
    });
    var x = panel.querySelector(".nt-x");
    if (x) x.addEventListener("click", closeNotation);
  }

  function boot() { wireGlossary(); wireNotation(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
(function () {
  var root = document.documentElement, KEY = "qr.sidebar.mini";
  function save(v) { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {} }
  function $(s) { return document.querySelector(s); }

  function badge() {
    var el = $("#railDue"); if (!el) return;
    var n = 0;
    try { n = (window.__STUDY__ && window.__STUDY__.due) ? window.__STUDY__.due() : 0; }
    catch (e) { n = 0; }
    if (n > 0) { el.textContent = n > 99 ? "99+" : String(n); el.hidden = false; }
    else { el.hidden = true; }
  }

  function apply(v, persist) {
    root.classList.toggle("sbmini", v);
    var b = $("#sbMin");
    if (b) {
      b.setAttribute("aria-expanded", v ? "false" : "true");
      b.setAttribute("aria-label", v ? "Show contents" : "Minimise contents");
    }
    var rail = $("#sbrail");
    if (rail) rail.setAttribute("aria-hidden", v ? "false" : "true");
    if (persist !== false) save(v);
    if (v) badge();
  }

  function toggle() {
    var v = !root.classList.contains("sbmini");
    apply(v, true);
    var f = v ? $('#sbrail [data-rail="open"]') : $("#sbMin");
    if (f && matchMedia("(min-width:901px)").matches) f.focus();
  }

  function wire() {
    apply(root.classList.contains("sbmini"), false);

    var m = $("#sbMin");
    if (m) m.addEventListener("click", toggle);

    var rail = $("#sbrail");
    if (rail) rail.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-rail]") : null;
      if (!b) return;
      var act = b.getAttribute("data-rail");
      if (act === "open") { toggle(); return; }
      if (act === "search") {
        apply(false, true);
        var q = $("#q"); if (q) { q.focus(); q.select(); }
        return;
      }
      // The real controls stay the single source of truth; the rail presses them.
      var t = act === "study" ? $("#studyBtn")
            : act === "notation" ? $("#notationBtn")
            : act === "theme" ? $("#themeBtn") : null;
      if (t) t.click();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "[") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" ||
          e.target.isContentEditable) return;
      if ($("#review") && $("#review").classList.contains("on")) return;
      e.preventDefault();
      toggle();
    });

    document.addEventListener("qr:study", badge);
    badge();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
;
/* ============================================================
   VOLUME 26 — THE FORGE
   A strategy laboratory that runs entirely inside this file.

   No network, no libraries, no eval(). Every rolling window is
   causal by construction; the only way to see the future is to
   set execution lag to 0, which the interface labels as cheating.
   ============================================================ */
(function (root) {
  "use strict";

  var F = {};
  var NaNv = NaN;

  /* ============================================================
     1. Deterministic randomness
     Same seed, same world, every time. Reproducibility is not a
     nicety here: without it you cannot tell a parameter change
     from a different draw of noise.
     ============================================================ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    var u = mulberry32((seed | 0) || 1);
    var spare = null;
    this.u = u;
    this.n = function () {                     // Box–Muller, cached spare
      if (spare !== null) { var s = spare; spare = null; return s; }
      var a = 0, b = 0;
      while (a === 0) a = u();
      b = u();
      var r = Math.sqrt(-2 * Math.log(a)), th = 2 * Math.PI * b;
      spare = r * Math.sin(th);
      return r * Math.cos(th);
    };
    this.t = function (df) {                   // Student-t, unit variance
      if (!df || df >= 200) return this.n();
      var z = this.n(), c = 0;
      for (var i = 0; i < df; i++) { var g = this.n(); c += g * g; }
      var raw = z / Math.sqrt(c / df);
      return raw * Math.sqrt((df - 2) / df);   // rescale to variance 1
    };
    this.pois = function (lam) {
      if (lam <= 0) return 0;
      var L = Math.exp(-lam), k = 0, p = 1;
      do { k++; p *= u(); } while (p > L);
      return k - 1;
    };
  }
  F.RNG = RNG;

  /* ============================================================
     2. Causal series primitives
     Every one of these reads index t and earlier, never later.
     Warm-up cells are NaN and are excluded downstream rather than
     silently filled — a filled warm-up is a lookahead bug wearing
     a disguise.
     ============================================================ */
  function nanArr(T) { var a = new Float64Array(T); a.fill(NaNv); return a; }
  F.nanArr = nanArr;

  function lag(x, d) {
    var T = x.length, o = nanArr(T);
    d = Math.max(0, Math.round(d));
    for (var t = d; t < T; t++) o[t] = x[t - d];
    return o;
  }
  function delta(x, d) {
    var T = x.length, o = nanArr(T);
    d = Math.max(1, Math.round(d));
    for (var t = d; t < T; t++) o[t] = x[t] - x[t - d];
    return o;
  }
  function rollSum(x, n) {
    var T = x.length, o = nanArr(T), s = 0, cnt = 0;
    n = Math.max(1, Math.round(n));
    for (var t = 0; t < T; t++) {
      var v = x[t];
      if (v === v) { s += v; cnt++; }
      if (t >= n) { var old = x[t - n]; if (old === old) { s -= old; cnt--; } }
      if (t >= n - 1 && cnt === n) o[t] = s;
    }
    return o;
  }
  function rollMean(x, n) {
    var s = rollSum(x, n), T = s.length, o = nanArr(T);
    n = Math.max(1, Math.round(n));
    for (var t = 0; t < T; t++) o[t] = s[t] / n;
    return o;
  }
  function rollSd(x, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(2, Math.round(n));
    var s = 0, s2 = 0, cnt = 0;
    for (var t = 0; t < T; t++) {
      var v = x[t];
      if (v === v) { s += v; s2 += v * v; cnt++; }
      if (t >= n) { var old = x[t - n]; if (old === old) { s -= old; s2 -= old * old; cnt--; } }
      if (t >= n - 1 && cnt === n) {
        var m = s / n, va = (s2 / n) - m * m;
        o[t] = va > 0 ? Math.sqrt(va * n / (n - 1)) : 0;
      }
    }
    return o;
  }
  function ema(x, n) {
    var T = x.length, o = nanArr(T), k = 2 / (Math.max(1, n) + 1), prev = NaNv;
    for (var t = 0; t < T; t++) {
      var v = x[t];
      if (v !== v) { o[t] = prev; continue; }
      prev = (prev === prev) ? prev + k * (v - prev) : v;
      o[t] = prev;
    }
    return o;
  }
  function rollMin(x, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(1, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var m = Infinity, ok = true;
      for (var j = t - n + 1; j <= t; j++) { var v = x[j]; if (v !== v) { ok = false; break; } if (v < m) m = v; }
      if (ok) o[t] = m;
    }
    return o;
  }
  function rollMax(x, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(1, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var m = -Infinity, ok = true;
      for (var j = t - n + 1; j <= t; j++) { var v = x[j]; if (v !== v) { ok = false; break; } if (v > m) m = v; }
      if (ok) o[t] = m;
    }
    return o;
  }
  function rollArg(x, n, wantMax) {
    var T = x.length, o = nanArr(T);
    n = Math.max(1, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var best = wantMax ? -Infinity : Infinity, bi = 0, ok = true;
      for (var j = t - n + 1; j <= t; j++) {
        var v = x[j]; if (v !== v) { ok = false; break; }
        if (wantMax ? v > best : v < best) { best = v; bi = t - j; }
      }
      if (ok) o[t] = bi;
    }
    return o;
  }
  function tsRank(x, n) {                       // rank of today within the last n, in [0,1]
    var T = x.length, o = nanArr(T);
    n = Math.max(2, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var c = 0, ok = true, cur = x[t];
      if (cur !== cur) continue;
      for (var j = t - n + 1; j <= t; j++) { var v = x[j]; if (v !== v) { ok = false; break; } if (v <= cur) c++; }
      if (ok) o[t] = (c - 1) / (n - 1);
    }
    return o;
  }
  function decayLinear(x, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(1, Math.round(n));
    var wsum = n * (n + 1) / 2;
    for (var t = n - 1; t < T; t++) {
      var s = 0, ok = true;
      for (var j = 0; j < n; j++) { var v = x[t - j]; if (v !== v) { ok = false; break; } s += v * (n - j); }
      if (ok) o[t] = s / wsum;
    }
    return o;
  }
  function rollCorr(x, y, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(3, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, ok = true;
      for (var j = t - n + 1; j <= t; j++) {
        var a = x[j], b = y[j];
        if (a !== a || b !== b) { ok = false; break; }
        sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
      }
      if (!ok) continue;
      var cov = sxy / n - (sx / n) * (sy / n);
      var vx = sxx / n - (sx / n) * (sx / n), vy = syy / n - (sy / n) * (sy / n);
      o[t] = (vx > 1e-18 && vy > 1e-18) ? cov / Math.sqrt(vx * vy) : 0;
    }
    return o;
  }
  function rollCov(x, y, n) {
    var T = x.length, o = nanArr(T);
    n = Math.max(2, Math.round(n));
    for (var t = n - 1; t < T; t++) {
      var sx = 0, sy = 0, sxy = 0, ok = true;
      for (var j = t - n + 1; j <= t; j++) {
        var a = x[j], b = y[j];
        if (a !== a || b !== b) { ok = false; break; }
        sx += a; sy += b; sxy += a * b;
      }
      if (ok) o[t] = (sxy - sx * sy / n) / (n - 1);
    }
    return o;
  }
  function rollSlope(x, n) {                     // OLS slope of x on time, per bar
    var T = x.length, o = nanArr(T);
    n = Math.max(3, Math.round(n));
    var sj = 0, sjj = 0;
    for (var j = 0; j < n; j++) { sj += j; sjj += j * j; }
    var den = n * sjj - sj * sj;
    for (var t = n - 1; t < T; t++) {
      var sy = 0, sjy = 0, ok = true;
      for (var k = 0; k < n; k++) {
        var v = x[t - n + 1 + k]; if (v !== v) { ok = false; break; }
        sy += v; sjy += k * v;
      }
      if (ok) o[t] = (n * sjy - sj * sy) / den;
    }
    return o;
  }
  function zscore(x, n) {
    var m = rollMean(x, n), s = rollSd(x, n), T = x.length, o = nanArr(T);
    for (var t = 0; t < T; t++) {
      var sd = s[t];
      if (sd === sd && sd > 1e-12 && x[t] === x[t] && m[t] === m[t]) o[t] = (x[t] - m[t]) / sd;
      else if (sd === sd && x[t] === x[t] && m[t] === m[t]) o[t] = 0;
    }
    return o;
  }
  function rsi(x, n) {
    var T = x.length, o = nanArr(T), up = nanArr(T), dn = nanArr(T);
    for (var t = 1; t < T; t++) {
      var d = x[t] - x[t - 1];
      up[t] = d > 0 ? d : 0; dn[t] = d < 0 ? -d : 0;
    }
    var mu = rollMean(up, n), md = rollMean(dn, n);
    for (var s = 0; s < T; s++) {
      if (mu[s] === mu[s] && md[s] === md[s]) {
        var den = mu[s] + md[s];
        o[s] = den > 1e-18 ? 100 * mu[s] / den : 50;
      }
    }
    return o;
  }
  function mapArr(x, f) {
    var T = x.length, o = nanArr(T);
    for (var t = 0; t < T; t++) { var v = x[t]; if (v === v) o[t] = f(v); }
    return o;
  }
  /* Carry the last non-zero value forward. This is what lets a rule that
     only fires at an extreme — a breakout — hold the position it opened
     until the opposite extreme fires. Strictly causal: it can only ever
     repeat something already seen. */
  function hold(x) {
    var T = x.length, o = nanArr(T), cur = NaNv;
    for (var t = 0; t < T; t++) {
      var v = x[t];
      if (v === v && v !== 0) cur = v;
      o[t] = cur;
    }
    return o;
  }
  function fillNaN(x, v) {
    var T = x.length, o = new Float64Array(T);
    for (var t = 0; t < T; t++) o[t] = (x[t] === x[t]) ? x[t] : v;
    return o;
  }

  F.series = {
    lag: lag, delta: delta, rollSum: rollSum, rollMean: rollMean, rollSd: rollSd,
    ema: ema, rollMin: rollMin, rollMax: rollMax, rollArg: rollArg, tsRank: tsRank,
    decayLinear: decayLinear, rollCorr: rollCorr, rollCov: rollCov, rollSlope: rollSlope,
    zscore: zscore, rsi: rsi, mapArr: mapArr, hold: hold, fillNaN: fillNaN
  };

  /* ============================================================
     3. The market generator
     The point of a synthetic market is not realism. It is that you
     KNOW whether an edge exists, because you put it there. Set the
     trend strength to zero and every trend strategy that still looks
     good is telling you about your search, not about the market.
     ============================================================ */
  var DAYS = 252;

  function generate(cfg) {
    var seed = (cfg.seed | 0) || 1;
    var T = Math.max(60, Math.round((cfg.years || 10) * DAYS));
    var N = Math.max(1, Math.min(24, Math.round(cfg.assets || 1)));
    var r = new RNG(seed);

    var muA = (cfg.mu || 0) / 100;            // annual drift
    var sdA = (cfg.sigma || 16) / 100;        // annual vol
    var muD = muA / DAYS;
    var sdD = sdA / Math.sqrt(DAYS);

    var world = cfg.world || "iid";
    var trendPhi = Math.min(0.995, 1 - 1 / Math.max(2, cfg.trendHalf || 60));
    /* Trend strength is expressed as a percentage of the daily noise, not as a
       drift in its own right. At strength 100 the predictable component has a
       standard deviation of 12% of the day's noise, which is the ceiling of
       what a perfect drift-sign predictor could turn into roughly Sharpe 1.5.
       Real filters estimate that drift late and noisily and get a fraction of
       it. Anything more generous would teach the wrong lesson about how thin
       a genuine edge is. */
    var trendAmp = (cfg.trendStr || 0) / 100 * 0.12 * sdD;
    var kappa = (cfg.revertStr || 0) / 100 * 0.06;                 // daily pull toward fair
    var rho = Math.max(0, Math.min(0.95, (cfg.corr || 0) / 100));
    var tdf = cfg.tdf || 0;
    var jl = (cfg.jumpLam || 0) / DAYS;
    var jsz = (cfg.jumpSize || 0) / 100;
    var useG = !!cfg.garch;
    var gA = cfg.garchA || 0.08, gB = cfg.garchB || 0.90;
    var regime = world === "regime";
    var pStay = 0.985, pStayHi = 0.96, hiMult = cfg.regimeMult || 2.6;

    var close = [], open = [], high = [], low = [], vol = [], vwap = [], rets = [], cap = [];
    var i, t;
    for (i = 0; i < N; i++) {
      close.push(new Float64Array(T)); open.push(new Float64Array(T));
      high.push(new Float64Array(T)); low.push(new Float64Array(T));
      vol.push(new Float64Array(T)); vwap.push(new Float64Array(T));
      rets.push(nanArr(T)); cap.push(new Float64Array(T));
    }

    // shared market factor path
    var mktZ = new Float64Array(T);
    for (t = 0; t < T; t++) mktZ[t] = tdf ? r.t(tdf) : r.n();

    for (i = 0; i < N; i++) {
      var px = 100 * Math.exp(r.n() * 0.25);
      var driftS = 0;
      var fair = Math.log(px);
      var sig2 = sdD * sdD;
      var gOmega = sig2 * (1 - gA - gB);
      var hiState = false;
      var baseVolMult = 0.75 + 0.6 * r.u();       // assets differ in vol
      var baseCap = 2e9 * Math.exp(r.n() * 0.8);
      var adv = baseCap * 0.006;

      for (t = 0; t < T; t++) {
        /* Volatility state.
           The GARCH recursion is fed the UNAMPLIFIED innovation. Feeding it
           the regime-scaled shock would let the two mechanisms compound and
           the variance process would leave the stationary region. */
        if (useG && !(sig2 > 0 && isFinite(sig2))) sig2 = sdD * sdD;
        var sdG = useG ? Math.sqrt(Math.max(1e-14, sig2)) : sdD;
        var sdT = sdG * baseVolMult;
        if (regime) {
          var p = hiState ? (1 - pStayHi) : (1 - pStay);
          if (r.u() < p) hiState = !hiState;
          if (hiState) sdT *= hiMult;
        }

        // drift state
        if (world === "trend") {
          driftS = trendPhi * driftS + Math.sqrt(1 - trendPhi * trendPhi) * trendAmp * r.n();
        }
        var pull = 0;
        if (world === "revert") {
          fair += muD + sdD * 0.35 * r.n();                  // fair value wanders slowly
          pull = -kappa * (Math.log(px) - fair);
        }

        var eps = tdf ? r.t(tdf) : r.n();
        var z = rho > 0 ? Math.sqrt(rho) * mktZ[t] + Math.sqrt(1 - rho) * eps : eps;
        var shock = sdT * z;

        var jump = 0;
        if (jl > 0 && r.u() < jl) jump = jsz * (r.u() < 0.5 ? -1 : 1) * (0.5 + r.u());

        var rt = muD + driftS + pull + shock + jump;
        if (rt > 0.5) rt = 0.5; else if (rt < -0.5) rt = -0.5;   // no single day moves 65%
        if (useG) {
          var innov = sdG * z;                                   // regime scaling excluded
          sig2 = gOmega + gA * innov * innov + gB * sig2;
          if (!(sig2 > 0 && isFinite(sig2))) sig2 = sdD * sdD;
          if (sig2 > 400 * sdD * sdD) sig2 = 400 * sdD * sdD;
        }

        var prev = px;
        px = px * Math.exp(rt);

        // intraday envelope, consistent with the close-to-close move
        var rng = Math.abs(shock) * (0.9 + 0.9 * r.u());
        var op = prev * Math.exp(rt * (0.15 + 0.3 * r.u()));
        var hi = Math.max(op, px) * Math.exp(rng * 0.55);
        var lo = Math.min(op, px) * Math.exp(-rng * 0.55);
        var vv = adv * (0.55 + 1.4 * r.u()) * (1 + 3.5 * Math.abs(rt) / Math.max(1e-9, sdT));

        close[i][t] = px; open[i][t] = op; high[i][t] = hi; low[i][t] = lo;
        vol[i][t] = vv / px;
        vwap[i][t] = (op + hi + lo + px) / 4;
        cap[i][t] = baseCap * px / 100;
        if (t > 0) rets[i][t] = Math.log(px / prev);
      }
    }

    var names = [];
    for (i = 0; i < N; i++) names.push("SYN" + (i + 1));
    var dates = [];
    var d0 = Date.UTC(2016, 0, 4);
    for (t = 0; t < T; t++) dates.push(d0 + t * 86400000 * 1.42);

    return {
      T: T, N: N, names: names, dates: dates, synthetic: true,
      close: close, open: open, high: high, low: low, volume: vol, vwap: vwap,
      returns: rets, cap: cap,
      label: describeWorld(cfg)
    };
  }
  F.generate = generate;

  function describeWorld(cfg) {
    var w = cfg.world || "iid";
    if (w === "iid") return "No edge by construction — pure random walk";
    if (w === "trend") return (cfg.trendStr > 0 ? "Persistent drift: momentum is really there" : "Trend world with strength 0 — no edge");
    if (w === "revert") return (cfg.revertStr > 0 ? "Mean reversion is really there" : "Reversion world with strength 0 — no edge");
    if (w === "regime") return "Two volatility regimes, no directional edge";
    return w;
  }

  /* ---------- CSV import: your own data, parsed locally ---------- */
  function fromCSV(text, opts) {
    opts = opts || {};
    var lines = String(text).replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    if (lines.length < 30) throw new Error("Need at least 30 rows of data; found " + lines.length + ".");
    var delim = (lines[0].indexOf("\t") >= 0) ? "\t" : ((lines[0].split(";").length > lines[0].split(",").length) ? ";" : ",");
    var head = lines[0].split(delim).map(function (h) { return h.trim().toLowerCase().replace(/^"|"$/g, ""); });

    function findCol() {
      for (var a = 0; a < arguments.length; a++) {
        var k = head.indexOf(arguments[a]);
        if (k >= 0) return k;
      }
      return -1;
    }
    var iDate = findCol("date", "time", "timestamp", "datetime", "day");
    var iClose = findCol("close", "adj close", "adj_close", "adjclose", "price", "last", "px_last", "value");
    var iOpen = findCol("open", "o");
    var iHigh = findCol("high", "h");
    var iLow = findCol("low", "l");
    var iVol = findCol("volume", "vol", "v");

    // wide format: date + several price columns, one per asset
    var wide = (iClose < 0 && iDate >= 0 && head.length >= 3);
    var series = [], names = [], dates = [];

    if (wide) {
      var cols = [];
      for (var c = 0; c < head.length; c++) if (c !== iDate) { cols.push(c); names.push(head[c].toUpperCase()); }
      for (var q = 0; q < cols.length; q++) series.push([]);
      for (var li = 1; li < lines.length; li++) {
        var p = lines[li].split(delim);
        var okRow = true, row = [];
        for (var cc = 0; cc < cols.length; cc++) {
          var v = parseFloat(String(p[cols[cc]]).replace(/["\s,]/g, ""));
          if (!isFinite(v) || v <= 0) { okRow = false; break; }
          row.push(v);
        }
        if (!okRow) continue;
        dates.push(parseDate(p[iDate]));
        for (var cd = 0; cd < row.length; cd++) series[cd].push(row[cd]);
      }
      if (!series.length || series[0].length < 30) throw new Error("Could not read at least 30 usable rows.");
      return packPanel(series, names, dates, null, null, null, null);
    }

    if (iClose < 0) throw new Error("No close/price column found. Expected a header containing 'close' or 'price', or a date column plus one price column per asset.");
    var cl = [], op = [], hi = [], lo = [], vo = [];
    for (var l2 = 1; l2 < lines.length; l2++) {
      var pp = lines[l2].split(delim);
      var cv = parseFloat(String(pp[iClose]).replace(/["\s,]/g, ""));
      if (!isFinite(cv) || cv <= 0) continue;
      cl.push(cv);
      op.push(iOpen >= 0 ? num(pp[iOpen], cv) : cv);
      hi.push(iHigh >= 0 ? num(pp[iHigh], cv) : cv);
      lo.push(iLow >= 0 ? num(pp[iLow], cv) : cv);
      vo.push(iVol >= 0 ? num(pp[iVol], 0) : 0);
      dates.push(iDate >= 0 ? parseDate(pp[iDate]) : (Date.UTC(2000, 0, 1) + dates.length * 86400000));
    }
    if (cl.length < 30) throw new Error("Only " + cl.length + " usable rows after parsing; need 30 or more.");
    var nm = [opts.name || "MYDATA"];
    if (isDescending(dates)) {                    // newest-first exports
      cl.reverse(); op.reverse(); hi.reverse(); lo.reverse(); vo.reverse(); dates.reverse();
    }
    return packPanel([cl], nm, dates, [op], [hi], [lo], [vo]);
  }
  function num(s, dflt) { var v = parseFloat(String(s).replace(/["\s,]/g, "")); return isFinite(v) ? v : dflt; }
  /* Only reverse a file when it is clearly newest-first. A handful of
     unparseable dates must never be enough to flip the whole series, because
     a silently reversed price history is a backtest that trades backwards. */
  function isDescending(dates) {
    var up = 0, down = 0;
    for (var i = 1; i < dates.length; i++) {
      var a = dates[i - 1], b = dates[i];
      if (!a || !b) continue;
      if (b > a) up++; else if (b < a) down++;
    }
    return down > 5 && down > up * 3;
  }
  function parseDate(s) {
    var v = Date.parse(String(s).trim().replace(/^"|"$/g, ""));
    return isFinite(v) ? v : 0;
  }

  function packPanel(closeArrs, names, dates, opA, hiA, loA, voA) {
    var N = closeArrs.length, T = closeArrs[0].length;
    var close = [], open = [], high = [], low = [], volume = [], vwap = [], rets = [], cap = [];
    for (var i = 0; i < N; i++) {
      var c = Float64Array.from(closeArrs[i]);
      close.push(c);
      open.push(opA ? Float64Array.from(opA[i]) : c);
      high.push(hiA ? Float64Array.from(hiA[i]) : c);
      low.push(loA ? Float64Array.from(loA[i]) : c);
      var vv = new Float64Array(T);
      if (voA) for (var k = 0; k < T; k++) vv[k] = voA[i][k];
      else vv.fill(1e6);
      volume.push(vv);
      var w = new Float64Array(T);
      for (var q = 0; q < T; q++) w[q] = (open[i][q] + high[i][q] + low[i][q] + c[q]) / 4;
      vwap.push(w);
      var rr = nanArr(T);
      for (var t = 1; t < T; t++) rr[t] = Math.log(c[t] / c[t - 1]);
      rets.push(rr);
      var cp = new Float64Array(T);
      for (var z = 0; z < T; z++) cp[z] = c[z] * 1e7;
      cap.push(cp);
    }
    return {
      T: T, N: N, names: names, dates: dates, synthetic: false,
      close: close, open: open, high: high, low: low, volume: volume, vwap: vwap,
      returns: rets, cap: cap, label: "Your data — " + N + " series, " + T + " bars"
    };
  }
  F.fromCSV = fromCSV;

  /* ============================================================
     4. The expression language
     A recursive-descent parser over the operator vocabulary of
     Volume 22, so an alpha from the catalogue can be pasted in and
     run. No eval, no Function constructor: the AST is walked.
     ============================================================ */
  var KEYWORDS = {};

  function tokenize(src) {
    var toks = [], i = 0, s = src;
    var two = ["<=", ">=", "==", "!=", "&&", "||"];
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
      var t2 = s.substr(i, 2);
      if (two.indexOf(t2) >= 0) { toks.push({ k: "op", v: t2, p: i }); i += 2; continue; }
      if ("+-*/^(),?:<>!".indexOf(c) >= 0) { toks.push({ k: "op", v: c, p: i }); i++; continue; }
      if (/[0-9.]/.test(c)) {
        var j = i;
        while (j < s.length && /[0-9._eE]/.test(s[j])) {
          if ((s[j] === "e" || s[j] === "E") && j + 1 < s.length && (s[j + 1] === "-" || s[j + 1] === "+")) j++;
          j++;
        }
        var raw = s.slice(i, j).replace(/_/g, "");
        var n = parseFloat(raw);
        if (!isFinite(n)) throw perr("Not a number: " + raw, i);
        toks.push({ k: "num", v: n, p: i }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var j2 = i;
        while (j2 < s.length && /[A-Za-z0-9_.]/.test(s[j2])) j2++;
        toks.push({ k: "id", v: s.slice(i, j2), p: i }); i = j2; continue;
      }
      throw perr("Unexpected character " + JSON.stringify(c), i);
    }
    toks.push({ k: "end", v: "", p: s.length });
    return toks;
  }
  function perr(msg, pos) { var e = new Error(msg); e.pos = pos; e.parse = true; return e; }

  function parse(src) {
    var toks = tokenize(src), p = 0;
    function peek() { return toks[p]; }
    function eat(v) {
      var t = toks[p];
      if (t.v === v) { p++; return t; }
      throw perr("Expected " + JSON.stringify(v) + " but found " + (t.k === "end" ? "end of expression" : JSON.stringify(String(t.v))), t.p);
    }
    function ternary() {
      var c = orx();
      if (peek().v === "?") { eat("?"); var a = ternary(); eat(":"); var b = ternary(); return { n: "if", c: c, a: a, b: b }; }
      return c;
    }
    function orx() { var l = andx(); while (peek().v === "||") { eat("||"); l = { n: "bin", o: "||", l: l, r: andx() }; } return l; }
    function andx() { var l = cmp(); while (peek().v === "&&") { eat("&&"); l = { n: "bin", o: "&&", l: l, r: cmp() }; } return l; }
    function cmp() {
      var l = add();
      while (["<", ">", "<=", ">=", "==", "!="].indexOf(peek().v) >= 0 && peek().k === "op") {
        var o = peek().v; eat(o); l = { n: "bin", o: o, l: l, r: add() };
      }
      return l;
    }
    function add() {
      var l = mul();
      while ((peek().v === "+" || peek().v === "-") && peek().k === "op") { var o = peek().v; eat(o); l = { n: "bin", o: o, l: l, r: mul() }; }
      return l;
    }
    function mul() {
      var l = pow();
      while ((peek().v === "*" || peek().v === "/") && peek().k === "op") { var o = peek().v; eat(o); l = { n: "bin", o: o, l: l, r: pow() }; }
      return l;
    }
    function pow() {
      var l = unary();
      if (peek().v === "^") { eat("^"); return { n: "bin", o: "^", l: l, r: pow() }; }
      return l;
    }
    function unary() {
      if (peek().v === "-" && peek().k === "op") { eat("-"); return { n: "neg", a: unary() }; }
      if (peek().v === "+" && peek().k === "op") { eat("+"); return unary(); }
      if (peek().v === "!" && peek().k === "op") { eat("!"); return { n: "not", a: unary() }; }
      return primary();
    }
    function primary() {
      var t = peek();
      if (t.k === "num") { p++; return { n: "num", v: t.v }; }
      if (t.k === "id") {
        p++;
        if (peek().v === "(" && peek().k === "op") {
          eat("(");
          var args = [];
          if (peek().v !== ")") { args.push(ternary()); while (peek().v === "," && peek().k === "op") { eat(","); args.push(ternary()); } }
          eat(")");
          return { n: "call", f: t.v.toLowerCase(), a: args, p: t.p, raw: t.v };
        }
        return { n: "var", v: t.v.toLowerCase(), p: t.p, raw: t.v };
      }
      if (t.v === "(" && t.k === "op") { eat("("); var e = ternary(); eat(")"); return e; }
      throw perr(t.k === "end" ? "Expression ended unexpectedly" : "Unexpected " + JSON.stringify(String(t.v)), t.p);
    }
    var ast = ternary();
    if (peek().k !== "end") throw perr("Unexpected trailing " + JSON.stringify(String(peek().v)), peek().p);
    return ast;
  }
  F.parse = parse;

  /* ---- evaluation: values are either a number, or a matrix M[i] = Float64Array(T) ---- */
  function isMat(v) { return v && v.__mat === true; }
  function mat(arrs) { arrs.__mat = true; return arrs; }
  function constMat(v, P) {
    var o = [];
    for (var i = 0; i < P.N; i++) { var a = new Float64Array(P.T); a.fill(v); o.push(a); }
    return mat(o);
  }
  function toMat(v, P) { return isMat(v) ? v : constMat(v, P); }
  function scalarOf(v) {
    if (typeof v === "number") return v;
    if (isMat(v)) { for (var t = 0; t < v[0].length; t++) { if (v[0][t] === v[0][t]) return v[0][t]; } }
    return NaNv;
  }

  function binOp(o, A, B, P) {
    var a = toMat(A, P), b = toMat(B, P), out = [];
    for (var i = 0; i < P.N; i++) {
      var x = a[i], y = b[i], r = nanArr(P.T);
      for (var t = 0; t < P.T; t++) {
        var u = x[t], v = y[t];
        if (u !== u || v !== v) continue;
        var z;
        switch (o) {
          case "+": z = u + v; break;
          case "-": z = u - v; break;
          case "*": z = u * v; break;
          case "/": z = Math.abs(v) < 1e-12 ? NaNv : u / v; break;
          case "^": z = Math.pow(u, v); break;
          case "<": z = u < v ? 1 : 0; break;
          case ">": z = u > v ? 1 : 0; break;
          case "<=": z = u <= v ? 1 : 0; break;
          case ">=": z = u >= v ? 1 : 0; break;
          case "==": z = u === v ? 1 : 0; break;
          case "!=": z = u !== v ? 1 : 0; break;
          case "&&": z = (u !== 0 && v !== 0) ? 1 : 0; break;
          case "||": z = (u !== 0 || v !== 0) ? 1 : 0; break;
          default: z = NaNv;
        }
        r[t] = isFinite(z) ? z : NaNv;
      }
      out.push(r);
    }
    return mat(out);
  }

  function crossSection(M, P, fn) {
    var out = [], i, t;
    for (i = 0; i < P.N; i++) out.push(nanArr(P.T));
    var buf = new Array(P.N), idx = new Array(P.N);
    for (t = 0; t < P.T; t++) {
      var live = [];
      for (i = 0; i < P.N; i++) { var v = M[i][t]; if (v === v) live.push(i); }
      if (!live.length) continue;
      var vals = live.map(function (k) { return M[k][t]; });
      var res = fn(vals);
      for (var q = 0; q < live.length; q++) out[live[q]][t] = res[q];
    }
    return mat(out);
  }

  var FIELDS = ["close", "open", "high", "low", "volume", "vwap", "returns", "cap"];

  function evalAST(node, P, ctx) {
    switch (node.n) {
      case "num": return node.v;
      case "neg": {
        var a = evalAST(node.a, P, ctx);
        if (typeof a === "number") return -a;
        return binOp("*", a, -1, P);
      }
      case "not": {
        var b = toMat(evalAST(node.a, P, ctx), P), o = [];
        for (var i = 0; i < P.N; i++) o.push(mapArr(b[i], function (v) { return v === 0 ? 1 : 0; }));
        return mat(o);
      }
      case "bin": return binOp(node.o, evalAST(node.l, P, ctx), evalAST(node.r, P, ctx), P);
      case "if": {
        var c = toMat(evalAST(node.c, P, ctx), P);
        var x = toMat(evalAST(node.a, P, ctx), P);
        var y = toMat(evalAST(node.b, P, ctx), P);
        var out = [];
        for (var k = 0; k < P.N; k++) {
          var r = nanArr(P.T);
          for (var t = 0; t < P.T; t++) {
            var cv = c[k][t]; if (cv !== cv) continue;
            var pick = cv !== 0 ? x[k][t] : y[k][t];
            if (pick === pick) r[t] = pick;
          }
          out.push(r);
        }
        return mat(out);
      }
      case "var": return resolveVar(node, P, ctx);
      case "call": return resolveCall(node, P, ctx);
    }
    throw perr("Cannot evaluate node", 0);
  }

  function resolveVar(node, P, ctx) {
    var v = node.v;
    if (v === "pi") return Math.PI;
    if (v === "e") return Math.E;
    if (v === "t" || v === "bar") {
      var o = [];
      for (var i = 0; i < P.N; i++) { var a = new Float64Array(P.T); for (var t = 0; t < P.T; t++) a[t] = t; o.push(a); }
      return mat(o);
    }
    if (FIELDS.indexOf(v) >= 0) return mat(P[v].slice());
    if (v === "price") return mat(P.close.slice());
    var m = /^adv(\d+)$/.exec(v);
    if (m) return advN(P, parseInt(m[1], 10), ctx);
    throw perr("Unknown name " + JSON.stringify(node.raw) + ". Available: " + FIELDS.join(", ") + ", adv{n}, plus the functions listed under the box.", node.p);
  }

  function advN(P, n, ctx) {
    ctx.advCache = ctx.advCache || {};
    if (ctx.advCache[n]) return ctx.advCache[n];
    var o = [];
    for (var i = 0; i < P.N; i++) {
      var dollar = new Float64Array(P.T);
      for (var t = 0; t < P.T; t++) dollar[t] = P.volume[i][t] * P.close[i][t];
      o.push(rollMean(dollar, n));
    }
    var r = mat(o);
    ctx.advCache[n] = r;
    return r;
  }

  function argN(args, k, P, ctx, dflt) {
    if (args.length <= k) {
      if (dflt !== undefined) return dflt;
      throw perr("Missing argument " + (k + 1), 0);
    }
    var v = evalAST(args[k], P, ctx);
    var s = (typeof v === "number") ? v : scalarOf(v);
    if (!isFinite(s)) throw perr("Argument " + (k + 1) + " must be a plain number (a window length), not a series", 0);
    return s;
  }

  function perAsset(M, P, fn) {
    var o = [];
    for (var i = 0; i < P.N; i++) o.push(fn(M[i], i));
    return mat(o);
  }

  function resolveCall(node, P, ctx) {
    var f = node.f, A = node.a;
    function m(k) { return toMat(evalAST(A[k], P, ctx), P); }
    function s(k, d) { return argN(A, k, P, ctx, d); }
    function need(n) { if (A.length < n) throw perr(f + "() needs " + n + " argument" + (n > 1 ? "s" : "") + "; got " + A.length, node.p); }

    switch (f) {
      /* --- elementwise maths --- */
      case "abs": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.abs); });
      case "log": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, function (v) { return v > 0 ? Math.log(v) : NaNv; }); });
      case "exp": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.exp); });
      case "sqrt": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, function (v) { return v >= 0 ? Math.sqrt(v) : NaNv; }); });
      case "sign": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.sign); });
      case "tanh": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.tanh); });
      case "sin": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.sin); });
      case "cos": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.cos); });
      case "floor": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.floor); });
      case "round": need(1); return perAsset(m(0), P, function (x) { return mapArr(x, Math.round); });
      case "hold": need(1); return perAsset(m(0), P, function (x) { return hold(x); });
      case "fill": need(1); { var fv = s(1, 0); return perAsset(m(0), P, function (x) { return fillNaN(x, fv); }); }
      case "signedpower": need(2); {
        var pw = s(1);
        return perAsset(m(0), P, function (x) { return mapArr(x, function (v) { return Math.sign(v) * Math.pow(Math.abs(v), pw); }); });
      }
      case "power": need(2); return binOp("^", m(0), m(1), P);
      case "clip": need(3); {
        var lo = s(1), hi = s(2);
        return perAsset(m(0), P, function (x) { return mapArr(x, function (v) { return Math.max(lo, Math.min(hi, v)); }); });
      }
      case "min": need(2); {
        var a1 = m(0), b1 = m(1), o1 = [];
        for (var i1 = 0; i1 < P.N; i1++) { var r1 = nanArr(P.T); for (var t1 = 0; t1 < P.T; t1++) { var u1 = a1[i1][t1], v1 = b1[i1][t1]; if (u1 === u1 && v1 === v1) r1[t1] = Math.min(u1, v1); } o1.push(r1); }
        return mat(o1);
      }
      case "max": need(2); {
        var a2 = m(0), b2 = m(1), o2 = [];
        for (var i2 = 0; i2 < P.N; i2++) { var r2 = nanArr(P.T); for (var t2 = 0; t2 < P.T; t2++) { var u2 = a2[i2][t2], v2 = b2[i2][t2]; if (u2 === u2 && v2 === v2) r2[t2] = Math.max(u2, v2); } o2.push(r2); }
        return mat(o2);
      }

      /* --- time series --- */
      case "delay": case "lag": need(1); { var d = s(1, 1); return perAsset(m(0), P, function (x) { return lag(x, d); }); }
      case "delta": case "diff": need(1); { var d2 = s(1, 1); return perAsset(m(0), P, function (x) { return delta(x, d2); }); }
      case "sum": case "ts_sum": need(1); { var n1 = s(1, 20); return perAsset(m(0), P, function (x) { return rollSum(x, n1); }); }
      case "mean": case "sma": case "ts_mean": need(1); { var n2 = s(1, 20); return perAsset(m(0), P, function (x) { return rollMean(x, n2); }); }
      case "ema": case "ewm": need(1); { var n3 = s(1, 20); return perAsset(m(0), P, function (x) { return ema(x, n3); }); }
      case "stddev": case "std": case "ts_std": need(1); { var n4 = s(1, 20); return perAsset(m(0), P, function (x) { return rollSd(x, n4); }); }
      case "ts_min": need(1); { var n5 = s(1, 20); return perAsset(m(0), P, function (x) { return rollMin(x, n5); }); }
      case "ts_max": need(1); { var n6 = s(1, 20); return perAsset(m(0), P, function (x) { return rollMax(x, n6); }); }
      case "ts_argmin": need(1); { var n7 = s(1, 20); return perAsset(m(0), P, function (x) { return rollArg(x, n7, false); }); }
      case "ts_argmax": need(1); { var n8 = s(1, 20); return perAsset(m(0), P, function (x) { return rollArg(x, n8, true); }); }
      case "ts_rank": need(1); { var n9 = s(1, 20); return perAsset(m(0), P, function (x) { return tsRank(x, n9); }); }
      case "decay_linear": case "decay": need(1); { var na = s(1, 10); return perAsset(m(0), P, function (x) { return decayLinear(x, na); }); }
      case "zscore": case "z": need(1); { var nb = s(1, 60); return perAsset(m(0), P, function (x) { return zscore(x, nb); }); }
      case "slope": need(1); { var nc = s(1, 20); return perAsset(m(0), P, function (x) { return rollSlope(x, nc); }); }
      case "rsi": need(1); { var nd = s(1, 14); return perAsset(m(0), P, function (x) { return rsi(x, nd); }); }
      case "product": need(1); {
        var ne = s(1, 5);
        return perAsset(m(0), P, function (x) {
          var lg = mapArr(x, function (v) { return v > 0 ? Math.log(v) : NaNv; });
          return mapArr(rollSum(lg, ne), Math.exp);
        });
      }
      case "correlation": case "corr": need(2); {
        var nf = s(2, 20), Ma = m(0), Mb = m(1), of = [];
        for (var ifx = 0; ifx < P.N; ifx++) of.push(rollCorr(Ma[ifx], Mb[ifx], nf));
        return mat(of);
      }
      case "covariance": case "cov": need(2); {
        var ng = s(2, 20), Mc = m(0), Md = m(1), og = [];
        for (var ig = 0; ig < P.N; ig++) og.push(rollCov(Mc[ig], Md[ig], ng));
        return mat(og);
      }

      /* --- cross-sectional --- */
      case "rank": need(1); return crossSection(m(0), P, function (v) {
        if (v.length === 1) return [0.5];
        var idx = v.map(function (x, i) { return i; });
        idx.sort(function (a, b) { return v[a] - v[b]; });
        var out = new Array(v.length);
        for (var r = 0; r < idx.length; r++) out[idx[r]] = r / (idx.length - 1);
        return out;
      });
      case "scale": need(1); {
        var a3 = s(1, 1);
        return crossSection(m(0), P, function (v) {
          var s1 = 0; for (var i = 0; i < v.length; i++) s1 += Math.abs(v[i]);
          if (s1 < 1e-12) return v.map(function () { return 0; });
          return v.map(function (x) { return a3 * x / s1; });
        });
      }
      case "demean": case "indneutralize": return crossSection(m(0), P, function (v) {
        var s2 = 0; for (var i = 0; i < v.length; i++) s2 += v[i];
        var mu = s2 / v.length;
        return v.map(function (x) { return x - mu; });
      });
      case "cs_zscore": return crossSection(m(0), P, function (v) {
        if (v.length < 2) return [0];
        var s3 = 0, i; for (i = 0; i < v.length; i++) s3 += v[i];
        var mu2 = s3 / v.length, q = 0;
        for (i = 0; i < v.length; i++) q += (v[i] - mu2) * (v[i] - mu2);
        var sd = Math.sqrt(q / (v.length - 1));
        return v.map(function (x) { return sd > 1e-12 ? (x - mu2) / sd : 0; });
      });
    }
    throw perr("Unknown function " + JSON.stringify(node.raw) + "()", node.p);
  }

  F.evalExpr = function (src, P) {
    var ast = parse(src);
    var v = evalAST(ast, P, {});
    return toMat(v, P);
  };

  /* ============================================================
     5. Built-in signals
     Each is a plain expression in the language above, so nothing is
     hidden: press "open in editor" and the built-in becomes yours.
     ============================================================ */
  var PRESETS = {
    tsmom: {
      name: "Time-series momentum",
      expr: "sign(close - delay(close, {L}))",
      params: { L: 120 },
      vol: "Volume 13.1", shape: "raw",
      note: "Long if the price is above where it was L days ago, short if below. The whole of managed futures, in one line."
    },
    tsmomz: {
      name: "Momentum, scaled by conviction",
      expr: "clip(zscore(close - delay(close, {L}), 252), -2, 2)",
      params: { L: 120 },
      vol: "Volume 13.1", shape: "raw",
      note: "The same signal, but sized by how unusual the move is rather than by its sign alone."
    },
    macross: {
      name: "Moving-average crossover",
      expr: "(ema(close, {F}) - ema(close, {S})) / stddev(close, {S})",
      params: { F: 20, S: 100 },
      vol: "Volume 13.1", shape: "z",
      note: "Fast average minus slow, divided by price dispersion so the number means the same thing in every regime."
    },
    meanrev: {
      name: "Mean reversion",
      expr: "-clip(zscore(close, {L}), -3, 3)",
      params: { L: 20 },
      vol: "Volume 3.3", shape: "raw",
      note: "Fade the deviation from the rolling mean. Profitable exactly when the price is an OU process and ruinous when it trends."
    },
    breakout: {
      name: "Donchian breakout",
      expr: "hold((close > ts_max(delay(high, 1), {L})) - (close < ts_min(delay(low, 1), {L})))",
      params: { L: 55 },
      vol: "Volume 13.3", shape: "raw",
      note: "The original Turtle rule. It fires only at a new extreme, and hold() carries the position until the opposite extreme fires — compare it against yesterday's channel, never today's, or the breakout includes the bar that caused it."
    },
    volcarry: {
      name: "Short-vol carry proxy",
      expr: "clip(1 - stddev(returns, 20) / stddev(returns, 250), -1, 1)",
      params: {},
      vol: "Volume 13.4", shape: "raw",
      note: "Long when recent volatility is low relative to its own history. Earns steadily and then does not."
    },
    xsmom: {
      name: "Cross-sectional momentum",
      expr: "rank(close / delay(close, {L})) - 0.5",
      params: { L: 120 },
      vol: "Volume 5.4", assets: 12, shape: "demean",
      note: "Buys the winners and sells the losers within the universe, so the market's common move mostly cancels. Meaningless with one asset — rank of a single number is always the middle — so selecting this widens the universe to twelve."
    },
    xsrev: {
      name: "Cross-sectional short-term reversal",
      expr: "-(rank(sum(returns, {L})) - 0.5)",
      params: { L: 5 },
      vol: "Volume 5.4", assets: 12, shape: "demean",
      note: "The oldest documented anomaly and the one most thoroughly eaten by transaction costs. Run it, then put the spread back to four basis points and run it again."
    },
    alpha101: {
      name: "Alpha#101 from the catalogue",
      expr: "(close - open) / ((high - low) + 0.001)",
      params: {},
      vol: "Volume 22.5", assets: 12, shape: "demean",
      note: "The simplest entry in Kakushadze's catalogue: where in today's range did the close land. Copied out of Volume 22 without changing a character."
    },
    alpha006: {
      name: "Alpha#006 from the catalogue",
      expr: "-1 * correlation(open, volume, 10)",
      params: {},
      vol: "Volume 22.5", assets: 12, shape: "demean",
      note: "Negative correlation of opening price and volume, verbatim from the catalogue. Every one of the 101 can be pasted into the box below."
    },
    noise: {
      name: "A signal that cannot know anything",
      expr: "sign(sin(bar / {P}))",
      params: { P: 40 },
      vol: "Volume 18.1", shape: "raw",
      note: "This depends on the bar number and nothing else, so it cannot possibly contain information. Run the parameter sweep on it and watch a positive Sharpe appear anyway. That number is the amount of performance your search manufactures from nothing, and it is the honest floor under every other result on this page."
    }
  };
  F.PRESETS = PRESETS;

  function expandExpr(expr, params) {
    return String(expr).replace(/\{(\w+)\}/g, function (m0, k) {
      var v = params && params[k];
      return (v === undefined || v === null) ? m0 : String(v);
    });
  }
  F.expandExpr = expandExpr;

  /* ============================================================
     6. The backtest
     Positions decided at the close of bar t are applied to the
     return from bar t+lag-1 to t+lag. Costs are charged when the
     position changes, on the bar the change happens.
     ============================================================ */
  function stdNorm(x) { return x; }

  function backtest(P, cfg, sigMat) {
    var T = P.T, N = P.N;
    var lagBars = Math.max(0, Math.round(cfg.execLag === undefined ? 1 : cfg.execLag));
    var i, t;

    /* ---- 1. shape the raw signal ---- */
    var sig = [];
    for (i = 0; i < N; i++) sig.push(Float64Array.from(sigMat[i]));

    if (cfg.smooth && cfg.smooth > 1) for (i = 0; i < N; i++) sig[i] = ema(sig[i], cfg.smooth);

    if (cfg.shape === "sign") {
      for (i = 0; i < N; i++) sig[i] = mapArr(sig[i], function (v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); });
    } else if (cfg.shape === "z") {
      for (i = 0; i < N; i++) sig[i] = mapArr(zscore(sig[i], cfg.zWin || 252), function (v) { return Math.max(-3, Math.min(3, v)); });
    } else if (cfg.shape === "tanh") {
      for (i = 0; i < N; i++) sig[i] = mapArr(zscore(sig[i], cfg.zWin || 252), Math.tanh);
    } else if (cfg.shape === "demean" && N > 1) {
      var dm = crossSection(mat(sig), P, function (v) {
        var s = 0, k; for (k = 0; k < v.length; k++) s += v[k];
        var mu = s / v.length, q = 0;
        for (k = 0; k < v.length; k++) q += (v[k] - mu) * (v[k] - mu);
        var sd = Math.sqrt(q / Math.max(1, v.length - 1));
        return v.map(function (x) { return sd > 1e-12 ? (x - mu) / sd : 0; });
      });
      sig = dm;
    }

    /* ---- 2. size it ---- */
    var realVol = [];
    for (i = 0; i < N; i++) realVol.push(rollSd(P.returns[i], cfg.volWin || 60));

    var w = [];
    for (i = 0; i < N; i++) w.push(new Float64Array(T));
    var tgt = (cfg.targetVol || 12) / 100 / Math.sqrt(DAYS);
    var maxLev = cfg.maxLev === undefined ? 3 : cfg.maxLev;

    for (i = 0; i < N; i++) {
      for (t = 0; t < T; t++) {
        var sv = sig[i][t];
        if (sv !== sv) { w[i][t] = 0; continue; }
        var pos = 0;
        if (cfg.sizing === "flat") {
          pos = Math.sign(sv) * (cfg.flatSize === undefined ? 1 : cfg.flatSize);
        } else if (cfg.sizing === "linear") {
          pos = sv;
        } else if (cfg.sizing === "kelly") {
          var mu = rollMean(P.returns[i], cfg.volWin || 60)[t];
          var sd0 = realVol[i][t];
          if (sd0 !== sd0 || sd0 < 1e-9 || mu !== mu) { w[i][t] = 0; continue; }
          pos = Math.sign(sv) * ((cfg.kellyFrac || 25) / 100) * (mu / (sd0 * sd0));
        } else {                                  // volatility targeting
          var rv = realVol[i][t];
          if (rv !== rv || rv < 1e-9) { w[i][t] = 0; continue; }
          pos = sv * (tgt / rv);
        }
        if (!isFinite(pos)) pos = 0;
        w[i][t] = Math.max(-maxLev, Math.min(maxLev, pos));
      }
    }

    // spread the risk budget across assets so a bigger universe is not just more leverage
    if (N > 1 && cfg.splitBudget !== false) {
      var scale = 1 / Math.sqrt(N);
      for (i = 0; i < N; i++) for (t = 0; t < T; t++) w[i][t] *= scale;
    }

    /* ---- 3. walk forward through time, applying risk rules and costs ---- */
    var spread = (cfg.spreadBps || 0) / 1e4;
    var impact = (cfg.impactBps || 0) / 1e4;
    var fin = (cfg.financeBps || 0) / 1e4 / DAYS;
    var ddLimit = (cfg.ddLimit || 0) / 100;
    var stopPct = (cfg.stop || 0) / 100;

    var ret = new Float64Array(T);
    var gross = new Float64Array(T);
    var costArr = new Float64Array(T);
    var turn = new Float64Array(T);
    var lev = new Float64Array(T);
    var held = [];
    for (i = 0; i < N; i++) held.push(new Float64Array(T));

    var prevW = new Float64Array(N);
    var equity = 1, peak = 1, throttle = 1;
    var eqCurve = new Float64Array(T);
    var ddCurve = new Float64Array(T);
    var entryPx = new Float64Array(N), stopped = new Int8Array(N);
    var cSpread = 0, cImpact = 0, cFin = 0;
    var nTrades = 0, winBars = 0, liveBars = 0;

    /* The weight applied to bar t's return is the one decided at the close of
       bar t - lagBars. With the default lag of 1 that is yesterday's close:
       strictly causal. Setting lagBars to 0 applies a weight computed from
       today's close to today's return, which is the definition of lookahead —
       the interface labels that switch as cheating, and it is there so the
       size of the lie can be measured rather than argued about. */
    for (t = 0; t < T; t++) {
      var src = t - lagBars;
      var obs = src >= 0 ? src : 0;             // last close we are allowed to have seen
      var g = 0, tv = 0, cost = 0, lv = 0;

      for (i = 0; i < N; i++) {
        var want = src >= 0 ? w[i][src] : 0;
        if (want !== want) want = 0;

        // per-position stop, judged on the last close we are allowed to see
        if (stopPct > 0) {
          if (prevW[i] !== 0 && entryPx[i] > 0) {
            var move = Math.log(P.close[i][obs] / entryPx[i]) * Math.sign(prevW[i]);
            if (move < -stopPct) stopped[i] = 1;
          }
          if (stopped[i]) {
            if (want === 0 || Math.sign(want) !== Math.sign(prevW[i])) stopped[i] = 0;
            else want = 0;
          }
        }

        want *= throttle;
        var dw = want - prevW[i];
        if (Math.abs(dw) > 1e-12) {
          nTrades++;
          var sCost = spread * Math.abs(dw);
          var iCost = impact * Math.pow(Math.abs(dw), 1.5);
          cSpread += sCost; cImpact += iCost;
          cost += sCost + iCost;
          tv += Math.abs(dw);
          if (want !== 0 && Math.sign(want) !== Math.sign(prevW[i])) entryPx[i] = P.close[i][obs];
        }

        // the position now held is the one that earns this bar's return
        var rr = P.returns[i][t];
        if (rr === rr) g += want * rr;
        lv += Math.abs(want);
        held[i][t] = want;
        prevW[i] = want;
      }

      cFin += fin * lv;
      cost += fin * lv;

      var net = g - cost;
      ret[t] = net; gross[t] = g; costArr[t] = cost; turn[t] = tv; lev[t] = lv;
      if (lv > 1e-9) { liveBars++; if (net > 0) winBars++; }

      equity *= Math.exp(net);
      if (equity > peak) peak = equity;
      var dd = equity / peak - 1;
      eqCurve[t] = equity; ddCurve[t] = dd;

      // portfolio drawdown throttle: de-risk linearly, restore as equity recovers
      if (ddLimit > 0) {
        var used = Math.min(1, -dd / ddLimit);
        throttle = Math.max(0, 1 - used);
      }
    }

    return {
      ret: ret, gross: gross, cost: costArr, turn: turn, lev: lev,
      eq: eqCurve, dd: ddCurve, held: held, sig: sig, w: w,
      costs: { spread: cSpread, impact: cImpact, finance: cFin },
      nTrades: nTrades, winBars: winBars, liveBars: liveBars,
      lagBars: lagBars, T: T, N: N
    };
  }
  F.backtest = backtest;

  /* ============================================================
     7. Metrics, including the ones that deflate
     ============================================================ */
  function Phi(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }
  function PhiInv(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  F.Phi = Phi; F.PhiInv = PhiInv;

  function moments(x) {
    var n = 0, s = 0, i;
    for (i = 0; i < x.length; i++) if (x[i] === x[i]) { s += x[i]; n++; }
    if (n < 2) return { n: n, mean: 0, sd: 0, skew: 0, kurt: 3 };
    var mu = s / n, m2 = 0, m3 = 0, m4 = 0;
    for (i = 0; i < x.length; i++) {
      if (x[i] !== x[i]) continue;
      var d = x[i] - mu;
      m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
    }
    m2 /= n; m3 /= n; m4 /= n;
    var sd = Math.sqrt(m2);
    return {
      n: n, mean: mu, sd: sd,
      skew: sd > 1e-18 ? m3 / (sd * sd * sd) : 0,
      kurt: sd > 1e-18 ? m4 / (m2 * m2) : 3
    };
  }
  F.moments = moments;

  function metrics(bt, trials) {
    var r = bt.ret, T = r.length, i;
    var mm = moments(r);
    var ann = mm.mean * DAYS;
    var vol = mm.sd * Math.sqrt(DAYS);
    var sharpe = mm.sd > 1e-12 ? mm.mean / mm.sd * Math.sqrt(DAYS) : 0;

    var dsum = 0, dn = 0;
    for (i = 0; i < T; i++) if (r[i] < 0) { dsum += r[i] * r[i]; dn++; }
    var dsd = dn > 1 ? Math.sqrt(dsum / dn) : 0;
    var sortino = dsd > 1e-12 ? mm.mean / dsd * Math.sqrt(DAYS) : 0;

    var maxDD = 0, ddLen = 0, curLen = 0, peakT = 0;
    for (i = 0; i < T; i++) {
      if (bt.dd[i] < maxDD) maxDD = bt.dd[i];
      if (bt.dd[i] < -1e-9) { curLen++; if (curLen > ddLen) ddLen = curLen; } else curLen = 0;
    }
    var years = T / DAYS;
    var cagr = years > 0 ? Math.pow(Math.max(1e-9, bt.eq[T - 1]), 1 / years) - 1 : 0;

    var gm = moments(bt.gross);
    var grossSharpe = gm.sd > 1e-12 ? gm.mean / gm.sd * Math.sqrt(DAYS) : 0;

    var totTurn = 0, totLev = 0;
    for (i = 0; i < T; i++) { totTurn += bt.turn[i]; totLev += bt.lev[i]; }
    var turnAnn = totTurn / years;
    var avgLev = totLev / T;

    var totCost = bt.costs.spread + bt.costs.impact + bt.costs.finance;
    var costDragAnn = totCost / years;

    var tstat = sharpe * Math.sqrt(years);
    var hit = bt.liveBars > 0 ? bt.winBars / bt.liveBars : 0;

    // Deflated Sharpe — the same formula as the calculator in Volume 18.2
    var n = Math.max(1, Math.round(trials || 1));
    var g = 0.5772156649;
    // with a single trial there is no selection to deflate away
    var emax = n <= 1 ? 0 : (1 - g) * PhiInv(1 - 1 / n) + g * PhiInv(1 - 1 / (n * Math.E));
    if (!isFinite(emax)) emax = 0;
    var srStar = emax / Math.sqrt(DAYS);
    var srP = sharpe / Math.sqrt(DAYS);
    var denom = Math.sqrt(Math.max(1e-14, (1 - mm.skew * srP + (mm.kurt - 1) / 4 * srP * srP) / Math.max(1, T - 1)));
    var dsr = Phi((srP - srStar) / denom);
    var psr = Phi((srP - 0) / denom);

    return {
      years: years, cagr: cagr, ann: ann, vol: vol,
      sharpe: sharpe, grossSharpe: grossSharpe, sortino: sortino,
      maxDD: maxDD, ddLen: ddLen, calmar: maxDD < -1e-9 ? cagr / -maxDD : 0,
      turnover: turnAnn, avgLev: avgLev, hit: hit,
      skew: mm.skew, kurt: mm.kurt, tstat: tstat,
      trials: n, expMaxSharpe: emax, dsr: dsr, psr: psr,
      costDrag: costDragAnn, costs: bt.costs, totalCost: totCost,
      finalEq: bt.eq[T - 1], nTrades: bt.nTrades,
      exposure: bt.liveBars / T
    };
  }
  F.metrics = metrics;

  /* ============================================================
     8. One call that goes from config to result
     ============================================================ */
  var panelCache = { key: null, panel: null };

  function panelKey(cfg) {
    var m = cfg.market || {};
    return [m.source, m.seed, m.years, m.assets, m.mu, m.sigma, m.world, m.trendStr,
      m.trendHalf, m.revertStr, m.corr, m.tdf, m.jumpLam, m.jumpSize, m.garch,
      m.garchA, m.garchB, m.regimeMult].join("|");
  }

  function getPanel(cfg, userPanel) {
    if ((cfg.market && cfg.market.source) === "csv") {
      if (!userPanel) throw new Error("No imported data yet — paste a CSV in the data panel first.");
      return userPanel;
    }
    var k = panelKey(cfg);
    if (panelCache.key === k && panelCache.panel) return panelCache.panel;
    var p = generate(cfg.market || {});
    panelCache = { key: k, panel: p };
    return p;
  }
  F.getPanel = getPanel;
  F.clearCache = function () { panelCache = { key: null, panel: null }; };

  function run(cfg, userPanel, trials) {
    var P = getPanel(cfg, userPanel);
    var expr = cfg.expr;
    if (!expr || !String(expr).trim()) throw new Error("The signal expression is empty.");
    var sig = F.evalExpr(expandExpr(expr, cfg.params), P);
    var bt = backtest(P, cfg, sig);
    var mx = metrics(bt, trials);
    return { panel: P, bt: bt, m: mx, cfg: cfg };
  }
  F.run = run;

  /* ---- lightweight run used by sweeps: metrics only, no chart data kept ---- */
  function runQuick(cfg, P, trials, cache) {
    var key = expandExpr(cfg.expr, cfg.params);
    var sig;
    if (cache && cache[key]) sig = cache[key];
    else { sig = F.evalExpr(key, P); if (cache) cache[key] = sig; }
    var bt = backtest(P, cfg, sig);
    return metrics(bt, trials);
  }
  F.runQuick = runQuick;

  /* ============================================================
     9. Robustness: the parameter surface
     A single good cell is a coincidence. A plateau is a finding.
     ============================================================ */
  function sweep(cfg, P, spec, trials) {
    var xs = spec.xVals, ys = spec.yVals;
    var grid = [], cache = {}, best = -Infinity, bx = 0, by = 0, pos = 0, tot = 0;
    for (var j = 0; j < ys.length; j++) {
      var row = [];
      for (var i = 0; i < xs.length; i++) {
        var c = JSON.parse(JSON.stringify(cfg));
        setPath(c, spec.xKey, xs[i]);
        setPath(c, spec.yKey, ys[j]);
        var m;
        try { m = runQuick(c, P, trials, cache); } catch (e) { m = null; }
        var v = m ? m.sharpe : NaNv;
        row.push(v);
        tot++;
        if (v === v) { if (v > 0) pos++; if (v > best) { best = v; bx = i; by = j; } }
      }
      grid.push(row);
    }
    // plateau: how much of the best cell's 8-neighbourhood keeps at least half the Sharpe
    var nb = 0, nbOK = 0;
    for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      var yy = by + dj, xx = bx + di;
      if (yy < 0 || yy >= ys.length || xx < 0 || xx >= xs.length) continue;
      nb++;
      if (grid[yy][xx] >= best * 0.5) nbOK++;
    }
    return {
      grid: grid, xs: xs, ys: ys, best: best, bx: bx, by: by,
      posFrac: tot ? pos / tot : 0, cells: tot,
      plateau: nb ? nbOK / nb : 0
    };
  }
  F.sweep = sweep;

  function setPath(o, path, v) {
    var parts = path.split("."), cur = o;
    for (var i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = v;
  }
  function getPath(o, path) {
    var parts = path.split("."), cur = o;
    for (var i = 0; i < parts.length; i++) { if (cur === undefined || cur === null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  F.setPath = setPath; F.getPath = getPath;

  /* ============================================================
     10. Walk-forward
     Choose the parameter on the past, trade it on the future you
     had not seen, and report both numbers side by side. The gap
     between them is the honest measure of how much of the backtest
     was fitting.
     ============================================================ */
  function walkForward(cfg, P, spec, folds, trials) {
    folds = Math.max(2, Math.min(12, folds || 5));
    var T = P.T, seg = Math.floor(T / (folds + 1));
    if (seg < 80) throw new Error("Not enough history for " + folds + " folds. Use a longer sample or fewer folds.");
    var isS = [], oosS = [], picks = [], cache = {};
    var oosRet = [];

    for (var f = 0; f < folds; f++) {
      var isEnd = seg * (f + 1);
      var oosEnd = Math.min(T, seg * (f + 2));
      var bestV = -Infinity, bestP = spec.vals[0];

      for (var k = 0; k < spec.vals.length; k++) {
        var c = JSON.parse(JSON.stringify(cfg));
        setPath(c, spec.key, spec.vals[k]);
        var sub = slicePanel(P, 0, isEnd);
        var m;
        try { m = runQuick(c, sub, 1, null); } catch (e) { continue; }
        if (m.sharpe > bestV) { bestV = m.sharpe; bestP = spec.vals[k]; }
      }
      picks.push(bestP);
      isS.push(bestV);

      var c2 = JSON.parse(JSON.stringify(cfg));
      setPath(c2, spec.key, bestP);
      // run on data up to oosEnd, then measure only the new block
      var full = slicePanel(P, 0, oosEnd);
      var sig = F.evalExpr(expandExpr(c2.expr, c2.params), full);
      var bt = backtest(full, c2, sig);
      var seg2 = [];
      for (var t = isEnd; t < oosEnd; t++) seg2.push(bt.ret[t]);
      var mo = moments(Float64Array.from(seg2));
      oosS.push(mo.sd > 1e-12 ? mo.mean / mo.sd * Math.sqrt(DAYS) : 0);
      for (var q = 0; q < seg2.length; q++) oosRet.push(seg2[q]);
    }

    var allOOS = Float64Array.from(oosRet);
    var mAll = moments(allOOS);
    var combined = mAll.sd > 1e-12 ? mAll.mean / mAll.sd * Math.sqrt(DAYS) : 0;
    var avgIS = isS.reduce(function (a, b) { return a + b; }, 0) / isS.length;

    // equity of the stitched out-of-sample record
    var eq = new Float64Array(allOOS.length), e = 1, pk = 1, mdd = 0;
    for (var z = 0; z < allOOS.length; z++) {
      e *= Math.exp(allOOS[z]); eq[z] = e;
      if (e > pk) pk = e;
      var d = e / pk - 1; if (d < mdd) mdd = d;
    }
    return {
      folds: folds, isS: isS, oosS: oosS, picks: picks,
      avgIS: avgIS, oos: combined, eq: eq, maxDD: mdd,
      decay: avgIS !== 0 ? combined / avgIS : 0,
      n: allOOS.length
    };
  }
  F.walkForward = walkForward;

  function slicePanel(P, a, b) {
    var o = { T: b - a, N: P.N, names: P.names, synthetic: P.synthetic, label: P.label, dates: P.dates.slice(a, b) };
    ["close", "open", "high", "low", "volume", "vwap", "returns", "cap"].forEach(function (k) {
      o[k] = P[k].map(function (arr) { return arr.slice(a, b); });
    });
    return o;
  }
  F.slicePanel = slicePanel;

  /* ============================================================
     11. Monte Carlo on the trade sequence
     Reshuffles blocks of returns to ask: how much of the drawdown
     you saw was luck of ordering?
     ============================================================ */
  function bootstrap(bt, iters, blockLen, seed) {
    var r = bt.ret, T = r.length;
    var rng = new RNG(seed || 7);
    iters = iters || 400; blockLen = blockLen || 20;
    var sharpes = [], dds = [], finals = [];
    for (var it = 0; it < iters; it++) {
      var e = 1, pk = 1, mdd = 0, s = 0, s2 = 0, n = 0;
      for (var t = 0; t < T; t += blockLen) {
        var start = Math.floor(rng.u() * Math.max(1, T - blockLen));
        for (var k = 0; k < blockLen && t + k < T; k++) {
          var v = r[start + k];
          if (v !== v) continue;
          s += v; s2 += v * v; n++;
          e *= Math.exp(v);
          if (e > pk) pk = e;
          var d = e / pk - 1; if (d < mdd) mdd = d;
        }
      }
      if (n > 2) {
        var mu = s / n, sd = Math.sqrt(Math.max(1e-18, s2 / n - mu * mu));
        sharpes.push(mu / sd * Math.sqrt(DAYS));
      }
      dds.push(mdd); finals.push(e);
    }
    sharpes.sort(function (a, b) { return a - b; });
    dds.sort(function (a, b) { return a - b; });
    function q(arr, p) { return arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * arr.length)))] : 0; }
    return {
      iters: iters,
      sharpeP05: q(sharpes, 0.05), sharpeP50: q(sharpes, 0.5), sharpeP95: q(sharpes, 0.95),
      ddP05: q(dds, 0.05), ddP50: q(dds, 0.5),
      pLoss: finals.filter(function (x) { return x < 1; }).length / Math.max(1, finals.length),
      sharpes: sharpes, dds: dds
    };
  }
  F.bootstrap = bootstrap;

  F.DAYS = DAYS;

  if (typeof module !== "undefined" && module.exports) module.exports = F;
  root.__FORGE_ENGINE__ = F;
})(typeof window !== "undefined" ? window : globalThis);
;
/* ============================================================
   VOLUME 26 — THE FORGE: interface layer
   Builds the laboratory, draws every chart as inline SVG, keeps the
   trial counter honest, and writes out a spec and a Python file that
   reproduce what you built.
   ============================================================ */
(function () {
  "use strict";
  var E = window.__FORGE_ENGINE__;
  if (!E) return;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(x, d) {
    if (x === undefined || x === null || !isFinite(x)) return "—";
    return Number(x).toFixed(d === undefined ? 2 : d);
  }
  function pct(x, d) { return isFinite(x) ? fmt(x * 100, d === undefined ? 1 : d) + "%" : "—"; }

  /* ============================================================
     Persisted state: the configuration and the trial counter
     ============================================================ */
  var KEY = "qr-forge-v1";
  var state = { cfg: null, trials: 0, guide: {}, seenPeek: false };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === "object") {
          state.trials = o.trials || 0;
          state.guide = o.guide || {};
          state.seenPeek = !!o.seenPeek;
          if (o.cfg) state.cfg = o.cfg;
        }
      }
    } catch (e) { /* private browsing, quota, disabled storage — carry on */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var DEFAULT_CFG = {
    expr: "sign(close - delay(close, {L}))",
    params: { L: 120 },
    preset: "tsmom",
    shape: "raw", smooth: 0, zWin: 252,
    sizing: "vol", targetVol: 12, volWin: 60, maxLev: 3, flatSize: 1, kellyFrac: 25,
    execLag: 1, stop: 0, ddLimit: 0,
    spreadBps: 4, impactBps: 8, financeBps: 40,
    market: {
      source: "synthetic", seed: 7, years: 15, assets: 1, mu: 3, sigma: 18,
      world: "trend", trendStr: 60, trendHalf: 80, revertStr: 40, corr: 35,
      tdf: 0, jumpLam: 0, jumpSize: 6, garch: false, garchA: 0.08, garchB: 0.9, regimeMult: 2.6
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var cfg = null;
  var userPanel = null;
  var lastRun = null, lastSweep = null, lastWF = null, lastBoot = null;
  var honestTwin = null;

  /* ============================================================
     SVG drawing helpers
     Charts are built as strings and injected once: no library, no
     layout thrash, and they inherit the page's own diagram styles so
     they read as part of the document rather than as embedded UI.
     ============================================================ */
  /* Time-series charts stretch to the column width; anything containing a grid
     of labelled cells must keep its aspect ratio or the text distorts. */
  function svgOpen(w, h, label, fit) {
    return '<svg role="img" aria-label="' + esc(label) + '" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="' + (fit ? "xMidYMid meet" : "none") + '" class="fg-svg' +
      (fit ? " fg-fit" : "") + '" ' + (fit ? 'style="max-width:' + w + 'px"' : "") + '>';
  }
  function path(pts, cls) {
    if (!pts.length) return "";
    var d = "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L");
    return '<path d="' + d + '" class="' + cls + '"/>';
  }
  function area(pts, base, cls) {
    if (!pts.length) return "";
    var d = "M" + pts[0][0].toFixed(1) + " " + base.toFixed(1) + " L" +
      pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") +
      " L" + pts[pts.length - 1][0].toFixed(1) + " " + base.toFixed(1) + " Z";
    return '<path d="' + d + '" class="' + cls + '"/>';
  }
  function txt(x, y, s, cls, anchor) {
    return '<text x="' + x + '" y="' + y + '" class="' + (cls || "d-s") + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : "") + '>' + esc(s) + "</text>";
  }
  function line(x1, y1, x2, y2, cls) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="' + (cls || "d-axis") + '"/>';
  }
  function niceTicks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10));
    var err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 0.001 && out.length < 20; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return out;
  }

  /* ---------- equity curve, log scale, with drawdown shading ---------- */
  function chartEquity(res, wfEq) {
    var eq = res.bt.eq, T = eq.length;
    var W = 760, H = 260, ml = 54, mr = 12, mt = 14, mb = 26;
    var pw = W - ml - mr, ph = H - mt - mb;

    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < T; i++) {
      var v = Math.log(Math.max(1e-6, eq[i]));
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (!isFinite(lo)) { lo = -0.1; hi = 0.1; }
    var pad = Math.max(0.05, (hi - lo) * 0.08); lo -= pad; hi += pad;
    function X(t) { return ml + pw * t / Math.max(1, T - 1); }
    function Y(e) { return mt + ph * (1 - (Math.log(Math.max(1e-6, e)) - lo) / (hi - lo)); }

    var step = Math.max(1, Math.floor(T / 900));
    var pts = [], ptsHi = [];
    for (i = 0; i < T; i += step) pts.push([X(i), Y(eq[i])]);
    pts.push([X(T - 1), Y(eq[T - 1])]);

    var s = svgOpen(W, H, "Equity curve on a logarithmic scale");
    // horizontal gridlines at round multiples
    var ticks = niceTicks(lo, hi, 5);
    ticks.forEach(function (lv) {
      var y = Y(Math.exp(lv));
      s += line(ml, y, W - mr, y, "d-rule");
      s += txt(ml - 8, y + 3.5, (Math.exp(lv)).toFixed(Math.exp(lv) < 10 ? 2 : 0) + "×", "d-s", "end");
    });
    s += line(ml, Y(1), W - mr, Y(1), "d-axis");
    s += area(pts, Y(Math.exp(lo)), "fg-eqfill");
    s += path(pts, "d-curve");

    if (wfEq && wfEq.length > 4) {                     // stitched out-of-sample record
      var off = T - wfEq.length, p2 = [];
      var sc = eq[Math.max(0, off - 1)] || 1;
      for (i = 0; i < wfEq.length; i += Math.max(1, Math.floor(wfEq.length / 700)))
        p2.push([X(off + i), Y(wfEq[i] * sc)]);
      s += path(p2, "d-curve d-alt");
    }
    var yrs = res.m.years;
    s += txt(ml, H - 7, "0", "d-s", "start");
    s += txt(W - mr, H - 7, fmt(yrs, 1) + " years", "d-s", "end");
    s += "</svg>";
    return s;
  }

  /* ---------- underwater plot ---------- */
  function chartUnderwater(res) {
    var dd = res.bt.dd, T = dd.length;
    var W = 760, H = 120, ml = 54, mr = 12, mt = 10, mb = 20;
    var pw = W - ml - mr, ph = H - mt - mb;
    var worst = 0, i;
    for (i = 0; i < T; i++) if (dd[i] < worst) worst = dd[i];
    if (worst > -1e-6) worst = -0.01;
    function X(t) { return ml + pw * t / Math.max(1, T - 1); }
    function Y(d) { return mt + ph * (d / worst); }
    var step = Math.max(1, Math.floor(T / 900)), pts = [];
    for (i = 0; i < T; i += step) pts.push([X(i), Y(dd[i])]);
    pts.push([X(T - 1), Y(dd[T - 1])]);

    var s = svgOpen(W, H, "Depth below the previous equity peak, through time");
    s += line(ml, mt, W - mr, mt, "d-axis");
    s += area(pts, mt, "fg-ddfill");
    s += path(pts, "d-curve d-neg");
    s += txt(ml - 8, mt + 4, "0%", "d-s", "end");
    s += txt(ml - 8, mt + ph + 4, pct(worst, 0), "d-s", "end");
    s += "</svg>";
    return s;
  }

  /* ---------- rolling 1-year Sharpe ---------- */
  function chartRolling(res) {
    var r = res.bt.ret, T = r.length, win = 252;
    if (T < win + 30) return "";
    var W = 760, H = 130, ml = 54, mr = 12, mt = 12, mb = 20;
    var pw = W - ml - mr, ph = H - mt - mb;
    var vals = new Float64Array(T); vals.fill(NaN);
    var s1 = 0, s2 = 0, i;
    for (i = 0; i < T; i++) {
      var v = r[i]; s1 += v; s2 += v * v;
      if (i >= win) { var o = r[i - win]; s1 -= o; s2 -= o * o; }
      if (i >= win - 1) {
        var mu = s1 / win, sd = Math.sqrt(Math.max(1e-18, s2 / win - mu * mu));
        vals[i] = sd > 1e-12 ? mu / sd * Math.sqrt(252) : 0;
      }
    }
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < T; i++) if (vals[i] === vals[i]) { if (vals[i] < lo) lo = vals[i]; if (vals[i] > hi) hi = vals[i]; }
    if (!isFinite(lo)) return "";
    lo = Math.min(lo, -0.5); hi = Math.max(hi, 0.5);
    var padr = (hi - lo) * 0.1; lo -= padr; hi += padr;
    function X(t) { return ml + pw * t / Math.max(1, T - 1); }
    function Y(v) { return mt + ph * (1 - (v - lo) / (hi - lo)); }
    var pts = [], step = Math.max(1, Math.floor(T / 800));
    for (i = win - 1; i < T; i += step) pts.push([X(i), Y(vals[i])]);

    var s = svgOpen(W, H, "Rolling one-year Sharpe ratio");
    s += line(ml, Y(0), W - mr, Y(0), "d-axis");
    [lo + (hi - lo) * 0.05, hi - (hi - lo) * 0.05].forEach(function () {});
    niceTicks(lo, hi, 4).forEach(function (lv) {
      var y = Y(lv);
      if (Math.abs(lv) > 1e-9) s += line(ml, y, W - mr, y, "d-rule");
      s += txt(ml - 8, y + 3.5, fmt(lv, 1), "d-s", "end");
    });
    s += path(pts, "d-curve d-info");
    s += "</svg>";
    return s;
  }

  /* ---------- distribution of daily returns against a normal ---------- */
  function chartHist(res) {
    var r = res.bt.ret, T = r.length;
    var m = E.moments(r);
    if (m.sd < 1e-14) return "";
    var W = 370, H = 170, ml = 34, mr = 10, mt = 12, mb = 26;
    var pw = W - ml - mr, ph = H - mt - mb;
    var lim = 4.5 * m.sd, nb = 41, bins = new Float64Array(nb), i;
    for (i = 0; i < T; i++) {
      var v = r[i]; if (v !== v) continue;
      var k = Math.floor((v - m.mean + lim) / (2 * lim) * nb);
      if (k >= 0 && k < nb) bins[k]++;
    }
    var mx = 0;
    for (i = 0; i < nb; i++) if (bins[i] > mx) mx = bins[i];
    if (!mx) return "";
    var s = svgOpen(W, H, "Distribution of daily returns compared with a normal curve", true);
    var bw = pw / nb;
    for (i = 0; i < nb; i++) {
      var h = ph * bins[i] / mx;
      var mid = m.mean - lim + (i + 0.5) * (2 * lim / nb);
      s += '<rect x="' + (ml + i * bw).toFixed(1) + '" y="' + (mt + ph - h).toFixed(1) +
        '" width="' + Math.max(0.5, bw - 0.8).toFixed(1) + '" height="' + h.toFixed(1) +
        '" class="' + (mid < 0 ? "fg-barneg" : "fg-barpos") + '"/>';
    }
    // normal reference with the same mean and sd
    var np = [];
    for (i = 0; i <= 80; i++) {
      var x = -lim + (2 * lim) * i / 80;
      var dens = Math.exp(-x * x / (2 * m.sd * m.sd));
      np.push([ml + pw * (i / 80), mt + ph * (1 - dens)]);
    }
    s += path(np, "d-curve d-alt");
    s += line(ml, mt + ph, W - mr, mt + ph, "d-axis");
    s += txt(ml + pw / 2, H - 6, "daily return", "d-s", "middle");
    s += txt(ml, mt + 10, "skew " + fmt(m.skew, 2) + " · kurtosis " + fmt(m.kurt, 1), "d-s", "start");
    s += "</svg>";
    return s;
  }

  /* ---------- where the gross return went ---------- */
  function chartCosts(res) {
    var m = res.m, yrs = m.years;
    var gross = 0, i;
    for (i = 0; i < res.bt.gross.length; i++) gross += res.bt.gross[i];
    gross /= yrs;
    var c = m.costs;
    var parts = [
      { k: "Spread", v: c.spread / yrs, cls: "fg-c1" },
      { k: "Impact", v: c.impact / yrs, cls: "fg-c2" },
      { k: "Financing", v: c.finance / yrs, cls: "fg-c3" }
    ];
    var net = gross - (parts[0].v + parts[1].v + parts[2].v);
    var W = 370, H = 170, ml = 76, mr = 46, mt = 16, mb = 16;
    var pw = W - ml - mr;
    var rows = [{ k: "Gross", v: gross, cls: "fg-c0" }].concat(parts).concat([{ k: "Net", v: net, cls: net >= 0 ? "fg-c4" : "fg-c5" }]);
    var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v); }).concat([1e-6]));
    var bh = (H - mt - mb) / rows.length;
    var s = svgOpen(W, H, "Annual gross return, the costs taken out of it, and what is left", true);
    rows.forEach(function (r, i2) {
      var y = mt + i2 * bh + 2, h = bh - 6;
      var w = pw * Math.abs(r.v) / mx;
      s += '<rect x="' + ml + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, w).toFixed(1) +
        '" height="' + h.toFixed(1) + '" class="' + r.cls + '"/>';
      s += txt(ml - 7, y + h / 2 + 4, r.k, "d-s", "end");
      s += txt(ml + Math.max(1, w) + 6, y + h / 2 + 4, pct(r.v, 1), "d-s", "start");
    });
    s += "</svg>";
    return s;
  }

  /* ---------- the parameter surface ---------- */
  function chartHeat(sw, spec) {
    var nx = sw.xs.length, ny = sw.ys.length;
    var cell = 34, ml = 78, mt = 26, mb = 44, mr = 16;
    var W = ml + nx * cell + mr, H = mt + ny * cell + mb;
    var vals = [];
    sw.grid.forEach(function (row) { row.forEach(function (v) { if (v === v) vals.push(v); }); });
    if (!vals.length) return "<p class='fg-none'>No cell produced a result.</p>";
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var lim = Math.max(Math.abs(lo), Math.abs(hi), 0.2);

    var s = svgOpen(W, H, "Sharpe ratio across a grid of two parameters", true);
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var v = sw.grid[j][i];
        var x = ml + i * cell, y = mt + (ny - 1 - j) * cell;
        var fill = "var(--surface-3)", op = 1;
        if (v === v) {
          var tt = Math.max(-1, Math.min(1, v / lim));
          fill = tt >= 0 ? "var(--pos)" : "var(--neg)";
          op = 0.14 + 0.8 * Math.abs(tt);
        }
        var isBest = (i === sw.bx && j === sw.by);
        s += '<rect x="' + x + '" y="' + y + '" width="' + (cell - 2) + '" height="' + (cell - 2) +
          '" fill="' + fill + '" fill-opacity="' + op.toFixed(3) + '"' +
          (isBest ? ' stroke="var(--accent)" stroke-width="2.2"' : ' stroke="var(--rule)" stroke-width="0.6"') + '/>';
        if (v === v && cell >= 30)
          s += txt(x + (cell - 2) / 2, y + (cell - 2) / 2 + 4, fmt(v, 1), "fg-cellv", "middle");
      }
    }
    for (i = 0; i < nx; i++)
      s += txt(ml + i * cell + (cell - 2) / 2, H - mb + 18, String(sw.xs[i]), "d-s", "middle");
    for (j = 0; j < ny; j++)
      s += txt(ml - 8, mt + (ny - 1 - j) * cell + (cell - 2) / 2 + 4, String(sw.ys[j]), "d-s", "end");
    s += txt(ml + nx * cell / 2, H - 8, spec.xLabel, "d-t", "middle");
    s += txt(0, 0, "", "d-s");
    s += '<text transform="translate(14,' + (mt + ny * cell / 2) + ') rotate(-90)" class="d-t" text-anchor="middle">' +
      esc(spec.yLabel) + "</text>";
    s += "</svg>";
    return s;
  }

  /* ---------- walk-forward: in-sample against out-of-sample ---------- */
  function chartWF(wf) {
    var n = wf.folds;
    var W = 370, H = 180, ml = 40, mr = 14, mt = 26, mb = 30;
    var pw = W - ml - mr, ph = H - mt - mb;
    var all = wf.isS.concat(wf.oosS);
    var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all);
    hi = Math.max(hi, 0.5); lo = Math.min(lo, -0.2);
    function Y(v) { return mt + ph * (1 - (v - lo) / (hi - lo)); }
    var gw = pw / n, bw = gw * 0.34;
    var s = svgOpen(W, H, "In-sample against out-of-sample Sharpe, fold by fold", true);
    s += line(ml, Y(0), W - mr, Y(0), "d-axis");
    niceTicks(lo, hi, 4).forEach(function (lv) {
      s += txt(ml - 6, Y(lv) + 3.5, fmt(lv, 1), "d-s", "end");
      if (Math.abs(lv) > 1e-9) s += line(ml, Y(lv), W - mr, Y(lv), "d-rule");
    });
    for (var i = 0; i < n; i++) {
      var x0 = ml + i * gw + gw * 0.1;
      var a = wf.isS[i], b = wf.oosS[i];
      s += '<rect x="' + x0.toFixed(1) + '" y="' + Math.min(Y(a), Y(0)).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.abs(Y(a) - Y(0)).toFixed(1) + '" class="fg-isbar"/>';
      s += '<rect x="' + (x0 + bw + 3).toFixed(1) + '" y="' + Math.min(Y(b), Y(0)).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.abs(Y(b) - Y(0)).toFixed(1) + '" class="' + (b >= 0 ? "fg-oosbar" : "fg-oosbarneg") + '"/>';
      s += txt(x0 + bw, H - 16, String(i + 1), "d-s", "middle");
      s += txt(x0 + bw, H - 4, String(wf.picks[i]), "fg-tiny", "middle");
    }
    s += txt(ml, 12, "chosen on the past", "fg-legis", "start");
    s += txt(W - mr, 12, "earned on the future", "fg-legoos", "end");
    s += "</svg>";
    return s;
  }

  /* ---------- bootstrap: the range of outcomes the same edge could give ---------- */
  function chartBoot(b) {
    var arr = b.sharpes;
    if (!arr.length) return "";
    var W = 370, H = 160, ml = 34, mr = 12, mt = 14, mb = 26;
    var pw = W - ml - mr, ph = H - mt - mb;
    var lo = arr[0], hi = arr[arr.length - 1];
    if (hi - lo < 1e-6) return "";
    var nb = 34, bins = new Float64Array(nb), i;
    for (i = 0; i < arr.length; i++) {
      var k = Math.floor((arr[i] - lo) / (hi - lo) * nb);
      bins[Math.max(0, Math.min(nb - 1, k))]++;
    }
    var mx = Math.max.apply(null, Array.prototype.slice.call(bins));
    var s = svgOpen(W, H, "Distribution of Sharpe ratios across resampled histories", true);
    var bw = pw / nb;
    for (i = 0; i < nb; i++) {
      var h = ph * bins[i] / mx;
      var centre = lo + (i + 0.5) * (hi - lo) / nb;
      s += '<rect x="' + (ml + i * bw).toFixed(1) + '" y="' + (mt + ph - h).toFixed(1) +
        '" width="' + Math.max(0.5, bw - 0.7).toFixed(1) + '" height="' + h.toFixed(1) +
        '" class="' + (centre < 0 ? "fg-barneg" : "fg-barpos") + '"/>';
    }
    function X(v) { return ml + pw * (v - lo) / (hi - lo); }
    s += line(X(0), mt, X(0), mt + ph, "d-axis");
    s += line(ml, mt + ph, W - mr, mt + ph, "d-axis");
    s += txt(ml, H - 6, fmt(lo, 1), "d-s", "start");
    s += txt(W - mr, H - 6, fmt(hi, 1), "d-s", "end");
    s += txt(ml + pw / 2, mt + 8, "5th pct " + fmt(b.sharpeP05, 2) + " · median " + fmt(b.sharpeP50, 2), "d-s", "middle");
    s += "</svg>";
    return s;
  }

  /* ---------- what the signal and the position actually did ---------- */
  function chartPosition(res) {
    var held = res.bt.held[0], T = held.length;
    if (!held) return "";
    var W = 760, H = 92, ml = 54, mr = 12, mt = 10, mb = 18;
    var pw = W - ml - mr, ph = H - mt - mb;
    var mx = 0, i;
    for (i = 0; i < T; i++) if (Math.abs(held[i]) > mx) mx = Math.abs(held[i]);
    if (mx < 1e-9) mx = 1;
    function X(t) { return ml + pw * t / Math.max(1, T - 1); }
    function Y(v) { return mt + ph * (1 - (v / mx + 1) / 2); }
    var step = Math.max(1, Math.floor(T / 900)), pts = [];
    for (i = 0; i < T; i += step) pts.push([X(i), Y(held[i])]);
    var s = svgOpen(W, H, "Position held through time, first asset");
    s += line(ml, Y(0), W - mr, Y(0), "d-axis");
    s += area(pts, Y(0), "fg-posfill");
    s += path(pts, "d-curve d-info");
    s += txt(ml - 8, Y(mx) + 4, "+" + fmt(mx, 1), "d-s", "end");
    s += txt(ml - 8, Y(-mx) + 4, "−" + fmt(mx, 1), "d-s", "end");
    s += txt(ml, H - 4, "position in " + esc(res.panel.names[0]) + (res.panel.N > 1 ? " (first of " + res.panel.N + ")" : ""), "d-s", "start");
    s += "</svg>";
    return s;
  }

  /* ============================================================
     The verdict
     Everything the run knows, said plainly, with the uncomfortable
     parts first. This is the piece that makes the lab a teacher
     rather than a toy: a good-looking equity curve is never the
     last word here.
     ============================================================ */
  function verdict(res) {
    var m = res.m, out = [], worst = 0;

    function add(level, txt2) { out.push({ l: level, t: txt2 }); if (level > worst) worst = level; }

    if (cfg.execLag === 0) {
      var gap;
      if (honestTwin) {
        var d = m.sharpe - honestTwin.sharpe;
        gap = " The same strategy with a one-bar lag gives a Sharpe of <b>" + fmt(honestTwin.sharpe) +
          "</b> against " + fmt(m.sharpe) + " here.";
        gap += (d > 0.5)
          ? " That gap is the whole of the lie, and in real code it arrives silently."
          : " The gap is small, because this signal barely moves from one bar to the next — slow signals leak little. " +
            "Switch to a fast one, the short-horizon reversal for instance, and run this again: the faster the signal, " +
            "the more a one-bar leak is worth, which is why the bug is most dangerous exactly where it is hardest to see.";
      } else {
        gap = " Set the lag to 1 and run it again — the difference is the size of the lie.";
      }
      add(3, "<b>Execution lag is zero.</b> The position applied to each day's return was chosen using that same day's " +
        "close." + gap);
    }

    if (res.panel.N === 1 && /\b(rank|scale|demean|indneutralize|cs_zscore)\s*\(/.test(cfg.expr)) {
      add(2, "<b>This expression uses cross-sectional operators on a single asset.</b> rank() of one number is always " +
        "the middle of the range, so the signal is a constant and the result is meaningless. Widen the universe on the Market tab.");
    }

    if (res.panel.synthetic) {
      var mk = cfg.market, edgeless =
        mk.world === "iid" || mk.world === "regime" ||
        (mk.world === "trend" && (mk.trendStr || 0) <= 0) ||
        (mk.world === "revert" && (mk.revertStr || 0) <= 0);
      if (edgeless) {
        add(m.sharpe > 0.4 ? 3 : 1, edgeless && m.sharpe > 0.4
          ? "<b>There is no edge in this market.</b> You built it that way, and the strategy still returned a Sharpe of " +
            fmt(m.sharpe) + ". That number is entirely the product of your search. It is the single most useful thing " +
            "this laboratory can show you, because a real backtest looks exactly like this and does not announce itself."
          : "This market contains no edge by construction, so a Sharpe near zero is the correct answer and the pipeline is behaving.");
      }
    }

    var n = state.trials;
    if (n >= 2) {
      if (m.dsr < 0.5) {
        add(2, "<b>It does not survive deflation.</b> Across " + n + " runs, the best Sharpe you would expect from pure " +
          "noise alone is " + fmt(m.expMaxSharpe) + ". Yours is " + fmt(m.sharpe) + ". The deflated Sharpe — the " +
          "probability the edge is real given how hard you looked — is " + pct(m.dsr) + ".");
      } else if (m.dsr < 0.9) {
        add(1, "Deflated Sharpe of " + pct(m.dsr) + " after " + n + " runs. Suggestive, not established. Note how fast " +
          "it falls if you keep tuning.");
      } else {
        add(0, "Deflated Sharpe of " + pct(m.dsr) + " after " + n + " runs: it clears the bar for the search you have " +
          "actually done so far.");
      }
    } else {
      add(1, "This is your first run on this configuration, so nothing has been deflated yet. The counter above rises " +
        "with every run, and the bar rises with it.");
    }

    var costRatio = m.grossSharpe !== 0 ? (m.grossSharpe - m.sharpe) / Math.abs(m.grossSharpe) : 0;
    if (m.turnover > 40 && costRatio > 0.4) {
      add(2, "<b>Costs are eating it.</b> Turnover of " + fmt(m.turnover, 0) + " times a year takes the Sharpe from " +
        fmt(m.grossSharpe) + " gross to " + fmt(m.sharpe) + " net. Either slow the signal down or accept that this " +
        "belongs to someone with better fills than you.");
    } else if (costRatio > 0.25) {
      add(1, "Costs remove " + pct(costRatio, 0) + " of the gross Sharpe. Worth checking your cost assumptions are not flattering.");
    }
    if (cfg.spreadBps === 0 && cfg.impactBps === 0) {
      add(2, "<b>Costs are switched off.</b> A frictionless backtest is a physics problem, not a trading strategy. " +
        "Turn the spread up to something your broker would recognise and run it again.");
    }

    if (m.maxDD < -0.35) {
      add(2, "A maximum drawdown of " + pct(m.maxDD, 0) + " lasting " + Math.round(m.ddLen / 21) + " months. Before " +
        "believing you would hold through it, read Volume 25A.4 and ask what you would actually have done in month nine.");
    }
    if (m.avgLev > 4) add(1, "Average gross leverage of " + fmt(m.avgLev, 1) + "×. Financing and margin calls are real at that size.");
    if (m.years < 5) add(1, "Only " + fmt(m.years, 1) + " years of data. The standard error on a Sharpe ratio is roughly 1/√years, so this estimate is ±" + fmt(1 / Math.sqrt(Math.max(0.5, m.years)), 2) + " before anything else goes wrong.");
    if (Math.abs(m.tstat) < 2 && m.sharpe > 0) add(1, "t-statistic of " + fmt(m.tstat) + ". Below 2, which is the least demanding bar in common use and still not cleared.");

    if (lastSweep) {
      if (lastSweep.plateau < 0.4)
        add(2, "<b>The parameter surface is a spike, not a plateau.</b> Only " + pct(lastSweep.plateau, 0) + " of the cells " +
          "next to your best one keep even half its Sharpe. A real effect degrades gently as you move away from it.");
      else if (lastSweep.posFrac > 0.65)
        add(0, "The parameter surface is broad: " + pct(lastSweep.posFrac, 0) + " of the grid is positive and the " +
          "neighbourhood of the best cell holds up. That is what a real effect looks like.");
    }
    if (lastWF) {
      if (lastWF.decay < 0.35)
        add(2, "<b>Walk-forward gives it away.</b> Average in-sample Sharpe " + fmt(lastWF.avgIS) + ", out-of-sample " +
          fmt(lastWF.oos) + ". You are fitting the parameter to noise and the noise does not repeat.");
      else if (lastWF.oos > 0.2)
        add(0, "Out-of-sample Sharpe of " + fmt(lastWF.oos) + " against " + fmt(lastWF.avgIS) + " in-sample. The decay is " +
          "normal; the survival is the point.");
    }
    if (lastBoot && lastBoot.sharpeP05 < 0 && m.sharpe > 0) {
      add(1, "Resampling the return sequence puts the 5th percentile Sharpe at " + fmt(lastBoot.sharpeP05) +
        " and the probability of ending below where you started at " + pct(lastBoot.pLoss, 0) + ".");
    }

    if (!out.length) add(0, "Nothing alarming, which usually means you have not looked hard enough yet. Run the sweep and the walk-forward.");

    var tone = worst >= 3 ? "bad" : (worst >= 2 ? "bad" : (worst >= 1 ? "" : "good"));
    var head = worst >= 3 ? "This result is not real"
      : worst >= 2 ? "Serious problems"
        : worst >= 1 ? "Read before believing it"
          : "Holds up so far";
    var html = '<div class="fg-verdict ' + tone + '"><div class="fg-vh">' + head + "</div><ul>";
    out.sort(function (a, b) { return b.l - a.l; });
    out.forEach(function (o) { html += "<li>" + o.t + "</li>"; });
    html += "</ul></div>";
    return html;
  }

  /* ============================================================
     Export: a spec you can re-import, and Python that reproduces it
     ============================================================ */
  function astToPython(node) {
    function b(n) { return astToPython(n); }
    switch (node.n) {
      case "num": return String(node.v);
      case "neg": return "(-" + b(node.a) + ")";
      case "not": return "(1.0 - _bool(" + b(node.a) + "))";
      case "var": {
        var v = node.v;
        if (v === "pi") return "np.pi";
        if (v === "e") return "np.e";
        if (["close", "open", "high", "low", "volume", "vwap", "returns", "cap"].indexOf(v) >= 0) return "D['" + v + "']";
        if (v === "price") return "D['close']";
        var m = /^adv(\d+)$/.exec(v);
        if (m) return "adv(D, " + m[1] + ")";
        return "D['" + v + "']";
      }
      case "bin": {
        var o = node.o, L = b(node.l), R = b(node.r);
        if (o === "^") return "signed_pow_raw(" + L + ", " + R + ")";
        if (o === "&&") return "(_bool(" + L + ") * _bool(" + R + "))";
        if (o === "||") return "np.maximum(_bool(" + L + "), _bool(" + R + "))";
        if ([">", "<", ">=", "<=", "==", "!="].indexOf(o) >= 0)
          return "((" + L + ") " + (o === "!=" ? "!=" : o) + " (" + R + ")).astype(float)";
        if (o === "/") return "safe_div(" + L + ", " + R + ")";
        return "((" + L + ") " + o + " (" + R + "))";
      }
      case "if": return "np.where(_bool(" + b(node.c) + ") > 0, " + b(node.a) + ", " + b(node.b) + ")";
      case "call": {
        var f = node.f, a = node.a.map(b);
        var direct = {
          abs: "np.abs", log: "np.log", exp: "np.exp", sqrt: "np.sqrt", sign: "np.sign", tanh: "np.tanh"
        };
        if (direct[f]) return direct[f] + "(" + a[0] + ")";
        var map = {
          delay: "delay", lag: "delay", delta: "delta", diff: "delta",
          sum: "ts_sum", ts_sum: "ts_sum", mean: "sma", sma: "sma", ts_mean: "sma",
          ema: "ewma", ewm: "ewma", stddev: "stddev", std: "stddev", ts_std: "stddev",
          ts_min: "ts_min", ts_max: "ts_max", ts_argmin: "ts_argmin", ts_argmax: "ts_argmax",
          ts_rank: "ts_rank", decay_linear: "decay_linear", decay: "decay_linear",
          zscore: "zscore", z: "zscore", slope: "slope", rsi: "rsi", product: "ts_product",
          correlation: "correlation", corr: "correlation", covariance: "covariance", cov: "covariance",
          rank: "cs_rank", scale: "cs_scale", demean: "cs_demean", indneutralize: "cs_demean",
          cs_zscore: "cs_zscore", signedpower: "signed_power", power: "signed_pow_raw",
          clip: "clip3", min: "np.minimum", max: "np.maximum"
        };
        if (map[f]) return map[f] + "(" + a.join(", ") + ")";
        return f + "(" + a.join(", ") + ")";
      }
    }
    return "0.0";
  }

  var PY_LIB = [
    "import numpy as np, pandas as pd",
    "",
    "# ---- causal operators. Every window looks backwards only. ----",
    "def _bool(x):    return (np.asarray(x, float) != 0).astype(float)",
    "def safe_div(a, b):",
    "    b = np.asarray(b, float)",
    "    return np.where(np.abs(b) < 1e-12, np.nan, np.asarray(a, float) / np.where(np.abs(b) < 1e-12, 1.0, b))",
    "def signed_pow_raw(a, b): return np.power(np.asarray(a, float), np.asarray(b, float))",
    "def signed_power(a, p):   a = np.asarray(a, float); return np.sign(a) * np.abs(a) ** p",
    "def clip3(x, lo, hi):     return np.clip(np.asarray(x, float), lo, hi)",
    "def _df(x, like):         return x if isinstance(x, pd.DataFrame) else pd.DataFrame(np.broadcast_to(np.asarray(x, float), like.shape), index=like.index, columns=like.columns)",
    "",
    "def delay(x, d=1):        return pd.DataFrame(x).shift(int(d))",
    "def delta(x, d=1):        return pd.DataFrame(x) - pd.DataFrame(x).shift(int(d))",
    "def ts_sum(x, d=20):      return pd.DataFrame(x).rolling(int(d)).sum()",
    "def sma(x, d=20):         return pd.DataFrame(x).rolling(int(d)).mean()",
    "def ewma(x, d=20):        return pd.DataFrame(x).ewm(span=int(d), adjust=False).mean()",
    "def stddev(x, d=20):      return pd.DataFrame(x).rolling(int(d)).std()",
    "def ts_min(x, d=20):      return pd.DataFrame(x).rolling(int(d)).min()",
    "def ts_max(x, d=20):      return pd.DataFrame(x).rolling(int(d)).max()",
    "def ts_argmin(x, d=20):   return pd.DataFrame(x).rolling(int(d)).apply(lambda v: len(v)-1-int(np.argmin(v)), raw=True)",
    "def ts_argmax(x, d=20):   return pd.DataFrame(x).rolling(int(d)).apply(lambda v: len(v)-1-int(np.argmax(v)), raw=True)",
    "def ts_rank(x, d=20):     return pd.DataFrame(x).rolling(int(d)).apply(lambda v: (v <= v[-1]).sum()/len(v), raw=True)",
    "def ts_product(x, d=5):   return np.exp(pd.DataFrame(np.log(pd.DataFrame(x))).rolling(int(d)).sum())",
    "def decay_linear(x, d=10):",
    "    w = np.arange(int(d), 0, -1.0); w /= w.sum()",
    "    return pd.DataFrame(x).rolling(int(d)).apply(lambda v: float(np.dot(v, w)), raw=True)",
    "def zscore(x, d=60):",
    "    x = pd.DataFrame(x); m, s = x.rolling(int(d)).mean(), x.rolling(int(d)).std()",
    "    return (x - m) / s.replace(0, np.nan)",
    "def slope(x, d=20):",
    "    j = np.arange(int(d)); jc = j - j.mean(); den = float((jc**2).sum())",
    "    return pd.DataFrame(x).rolling(int(d)).apply(lambda v: float(np.dot(jc, v)/den), raw=True)",
    "def rsi(x, d=14):",
    "    x = pd.DataFrame(x); df = x.diff()",
    "    up, dn = df.clip(lower=0), (-df).clip(lower=0)",
    "    mu, md = up.rolling(int(d)).mean(), dn.rolling(int(d)).mean()",
    "    return 100 * mu / (mu + md).replace(0, np.nan)",
    "def correlation(a, b, d=20): return pd.DataFrame(a).rolling(int(d)).corr(pd.DataFrame(b))",
    "def covariance(a, b, d=20):  return pd.DataFrame(a).rolling(int(d)).cov(pd.DataFrame(b))",
    "def adv(D, d):               return (D['volume'] * D['close']).rolling(int(d)).mean()",
    "",
    "# ---- cross-sectional: act across assets on one date ----",
    "def cs_rank(x):    x = pd.DataFrame(x); return x.rank(axis=1, pct=True) if x.shape[1] > 1 else x*0 + 0.5",
    "def cs_demean(x):  x = pd.DataFrame(x); return x.sub(x.mean(axis=1), axis=0)",
    "def cs_zscore(x):  x = pd.DataFrame(x); return x.sub(x.mean(axis=1), axis=0).div(x.std(axis=1).replace(0, np.nan), axis=0)",
    "def cs_scale(x, a=1.0):",
    "    x = pd.DataFrame(x); s = x.abs().sum(axis=1).replace(0, np.nan)",
    "    return a * x.div(s, axis=0)"
  ].join("\n");

  function buildPython() {
    var ast, pyExpr;
    try {
      ast = E.parse(E.expandExpr(cfg.expr, cfg.params));
      pyExpr = astToPython(ast);
    } catch (e) {
      pyExpr = "# the expression did not parse: " + e.message + "\n    raise SystemExit(1)";
    }
    var c = cfg;
    var L = [];
    L.push('"""');
    L.push("Generated by The Forge, Volume 26 of The Quantitative & Systematic Trading Reference.");
    L.push("");
    L.push("Signal:   " + E.expandExpr(c.expr, c.params));
    L.push("Shaping:  " + c.shape + (c.smooth > 1 ? ", smoothed over " + c.smooth + " days" : ""));
    L.push("Sizing:   " + c.sizing + (c.sizing === "vol" ? " targeting " + c.targetVol + "% annual" : ""));
    L.push("Costs:    " + c.spreadBps + "bp spread, " + c.impactBps + "bp impact, " + c.financeBps + "bp financing");
    L.push("Lag:      " + c.execLag + " bar" + (c.execLag === 1 ? "" : "s") + (c.execLag === 0 ? "   *** LOOKAHEAD — this reproduces a cheat, not a strategy ***" : ""));
    L.push("");
    L.push("Reproduces the browser run exactly when given the same prices. Export the");
    L.push("data alongside this file to check that it does, before trusting either.");
    L.push('"""');
    L.push(PY_LIB);
    L.push("");
    L.push("DAYS = 252");
    L.push("");
    L.push("# ---- the strategy -------------------------------------------------");
    L.push("def signal(D):");
    L.push('    """D is a dict of wide DataFrames: index = dates, columns = assets."""');
    L.push("    return pd.DataFrame(" + pyExpr + ", index=D['close'].index, columns=D['close'].columns)");
    L.push("");
    L.push("CFG = dict(");
    L.push("    shape=" + JSON.stringify(c.shape) + ", smooth=" + (c.smooth || 0) + ", z_win=" + (c.zWin || 252) + ",");
    L.push("    sizing=" + JSON.stringify(c.sizing) + ", target_vol=" + (c.targetVol / 100) + ", vol_win=" + c.volWin + ",");
    L.push("    max_lev=" + c.maxLev + ", flat_size=" + (c.flatSize === undefined ? 1 : c.flatSize) + ", kelly_frac=" + ((c.kellyFrac || 0) / 100) + ",");
    L.push("    exec_lag=" + c.execLag + ", stop=" + (c.stop / 100) + ", dd_limit=" + (c.ddLimit / 100) + ",");
    L.push("    spread=" + (c.spreadBps / 1e4) + ", impact=" + (c.impactBps / 1e4) + ", finance=" + (c.financeBps / 1e4) + ",");
    L.push("    split_budget=True,");
    L.push(")");
    L.push("");
    L.push([
      "def backtest(D, cfg=CFG):",
      "    close = D['close']; rets = np.log(close / close.shift(1))",
      "    sig = signal(D).astype(float)",
      "",
      "    if cfg['smooth'] and cfg['smooth'] > 1:",
      "        sig = sig.ewm(span=int(cfg['smooth']), adjust=False).mean()",
      "    if cfg['shape'] == 'sign':",
      "        sig = np.sign(sig)",
      "    elif cfg['shape'] == 'z':",
      "        sig = zscore(sig, cfg['z_win']).clip(-3, 3)",
      "    elif cfg['shape'] == 'tanh':",
      "        sig = np.tanh(zscore(sig, cfg['z_win']))",
      "    elif cfg['shape'] == 'demean' and close.shape[1] > 1:",
      "        sig = cs_zscore(sig)",
      "",
      "    rv = rets.rolling(int(cfg['vol_win'])).std()",
      "    tgt = cfg['target_vol'] / np.sqrt(DAYS)",
      "    if cfg['sizing'] == 'flat':",
      "        w = np.sign(sig) * cfg['flat_size']",
      "    elif cfg['sizing'] == 'linear':",
      "        w = sig",
      "    elif cfg['sizing'] == 'kelly':",
      "        mu = rets.rolling(int(cfg['vol_win'])).mean()",
      "        w = np.sign(sig) * cfg['kelly_frac'] * mu / rv.pow(2).replace(0, np.nan)",
      "    else:",
      "        w = sig * (tgt / rv.replace(0, np.nan))",
      "    w = w.clip(-cfg['max_lev'], cfg['max_lev']).fillna(0.0)",
      "    if cfg['split_budget'] and close.shape[1] > 1:",
      "        w = w / np.sqrt(close.shape[1])",
      "",
      "    # the weight applied to bar t is the one decided at bar t - exec_lag",
      "    w = w.shift(int(cfg['exec_lag'])).fillna(0.0)",
      "",
      "    equity, peak, throttle = 1.0, 1.0, 1.0",
      "    prev = np.zeros(close.shape[1])",
      "    out, gross_out, cost_out, turn_out = [], [], [], []",
      "    cs = ci = cf = 0.0",
      "    W = w.to_numpy(); R = rets.to_numpy()",
      "    for t in range(len(w)):",
      "        want = np.nan_to_num(W[t]) * throttle",
      "        dw = want - prev",
      "        sc = cfg['spread'] * np.abs(dw).sum()",
      "        ic = cfg['impact'] * (np.abs(dw) ** 1.5).sum()",
      "        fc = cfg['finance'] / DAYS * np.abs(want).sum()",
      "        cs += sc; ci += ic; cf += fc",
      "        g = float(np.nansum(want * np.nan_to_num(R[t])))",
      "        net = g - sc - ic - fc",
      "        out.append(net); gross_out.append(g); cost_out.append(sc + ic + fc)",
      "        turn_out.append(float(np.abs(dw).sum()))",
      "        prev = want",
      "        equity *= np.exp(net); peak = max(peak, equity)",
      "        if cfg['dd_limit'] > 0:",
      "            throttle = max(0.0, 1.0 - min(1.0, (peak - equity) / peak / cfg['dd_limit']))",
      "    r = pd.Series(out, index=w.index)",
      "    return dict(ret=r, gross=pd.Series(gross_out, index=w.index),",
      "                cost=pd.Series(cost_out, index=w.index),",
      "                turnover=pd.Series(turn_out, index=w.index),",
      "                costs=dict(spread=cs, impact=ci, finance=cf), weights=w)",
      "",
      "",
      "def metrics(res, trials=1):",
      "    from scipy.stats import norm            # only needed for the deflated Sharpe",
      "    r = res['ret'].dropna()",
      "    n_years = len(r) / DAYS",
      "    mu, sd = r.mean(), r.std(ddof=0)",
      "    sharpe = mu / sd * np.sqrt(DAYS) if sd > 0 else 0.0",
      "    eq = np.exp(r.cumsum()); dd = eq / eq.cummax() - 1",
      "    g = 0.5772156649",
      "    n = max(1, int(trials))",
      "    e_max = 0.0 if n <= 1 else (1 - g) * norm.ppf(1 - 1/n) + g * norm.ppf(1 - 1/(n*np.e))",
      "    sr_p, sr_star = sharpe / np.sqrt(DAYS), e_max / np.sqrt(DAYS)",
      "    sk, ku = r.skew(), r.kurtosis() + 3.0",
      "    denom = np.sqrt(max(1e-14, (1 - sk*sr_p + (ku-1)/4*sr_p**2) / max(1, len(r)-1)))",
      "    return dict(",
      "        years=n_years, sharpe=sharpe, ann_return=mu*DAYS, ann_vol=sd*np.sqrt(DAYS),",
      "        max_dd=float(dd.min()), turnover=float(res['turnover'].sum()/n_years),",
      "        t_stat=sharpe*np.sqrt(n_years), trials=n, expected_max_sharpe_from_noise=e_max,",
      "        deflated_sharpe=float(norm.cdf((sr_p - sr_star)/denom)),",
      "        costs={k: v/n_years for k, v in res['costs'].items()},",
      "    )",
      "",
      "",
      "def load_wide_csv(path):",
      '    """A date column plus one price column per asset."""',
      "    df = pd.read_csv(path, parse_dates=[0], index_col=0).sort_index()",
      "    return dict(close=df, open=df, high=df, low=df, vwap=df,",
      "                volume=pd.DataFrame(1e6, index=df.index, columns=df.columns),",
      "                returns=np.log(df / df.shift(1)),",
      "                cap=df * 1e7)",
      "",
      "",
      "if __name__ == '__main__':",
      "    import sys",
      "    if len(sys.argv) < 2:",
      "        raise SystemExit('usage: python strategy.py prices.csv   "
        + "(export the data from the Forge to reproduce the browser numbers)')",
      "    D = load_wide_csv(sys.argv[1])",
      "    res = backtest(D)",
      "    m = metrics(res, trials=" + Math.max(1, state.trials) + ")",
      "    for k, v in m.items():",
      "        print(f'{k:>34}: {v}')"
    ].join("\n"));
    return L.join("\n");
  }

  function buildDataCSV() {
    var P = lastRun ? lastRun.panel : E.getPanel(cfg, userPanel);
    var rows = ["date," + P.names.join(",")];
    for (var t = 0; t < P.T; t++) {
      var d = new Date(P.dates[t] || (Date.UTC(2000, 0, 1) + t * 86400000));
      var line2 = [isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(t)];
      for (var i = 0; i < P.N; i++) line2.push(P.close[i][t].toFixed(6));
      rows.push(line2.join(","));
    }
    return rows.join("\n");
  }

  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
      return true;
    } catch (e) { return false; }
  }

  /* ============================================================
     Controls, declared once and rendered from the declaration
     ============================================================ */
  function isSynth() { return cfg.market.source !== "csv"; }
  var CTRLS = {
    market: [
      { k: "market.source", t: "seg", label: "Where the prices come from", opts: [["synthetic", "Built market"], ["csv", "Your own CSV"]],
        help: "A built market is one whose edge you decide. Your own CSV is the real thing, with all of its ambiguity." },
      { k: "market.world", t: "seg", label: "What kind of market", show: isSynth,
        opts: [["iid", "Random walk"], ["trend", "Trending"], ["revert", "Mean-reverting"], ["regime", "Two vol regimes"]],
        help: "A random walk contains no edge at all. Use it as the control." },
      { k: "market.trendStr", t: "range", label: "Trend strength", min: 0, max: 100, step: 5, suf: "", show: function () { return isSynth() && cfg.market.world === "trend"; },
        help: "0 means there is nothing to find. 100 is about as much persistent drift as a real asset has ever shown." },
      { k: "market.trendHalf", t: "range", label: "Trend half-life", min: 10, max: 250, step: 5, suf: " d", show: function () { return isSynth() && cfg.market.world === "trend"; } },
      { k: "market.revertStr", t: "range", label: "Reversion strength", min: 0, max: 100, step: 5, show: function () { return isSynth() && cfg.market.world === "revert"; } },
      { k: "market.regimeMult", t: "range", label: "High-regime vol multiple", min: 1.5, max: 5, step: 0.1, dec: 1, suf: "×", show: function () { return isSynth() && cfg.market.world === "regime"; } },
      { k: "market.seed", t: "range", label: "Seed", min: 1, max: 200, step: 1, show: isSynth,
        help: "Change only this and nothing else. Whatever the Sharpe does across seeds is the noise in your estimate." },
      { k: "market.years", t: "range", label: "History", min: 2, max: 40, step: 1, suf: " y", show: isSynth },
      { k: "market.assets", t: "range", label: "Assets in the universe", min: 1, max: 24, step: 1, show: isSynth,
        help: "More than one asset makes the cross-sectional operators (rank, demean, scale) meaningful." },
      { k: "market.mu", t: "range", label: "Drift", min: -15, max: 15, step: 1, suf: "%", show: isSynth },
      { k: "market.sigma", t: "range", label: "Volatility", min: 5, max: 60, step: 1, suf: "%", show: isSynth },
      { k: "market.corr", t: "range", label: "Cross-asset correlation", min: 0, max: 95, step: 5, suf: "%", show: function () { return isSynth() && cfg.market.assets > 1; } },
      { k: "market.tdf", t: "range", label: "Fat tails (t degrees of freedom)", min: 0, max: 30, step: 1, show: isSynth,
        help: "0 is Gaussian. 3 to 5 is roughly what daily equity returns look like." },
      { k: "market.jumpLam", t: "range", label: "Jumps per year", min: 0, max: 24, step: 1, show: isSynth },
      { k: "market.jumpSize", t: "range", label: "Typical jump size", min: 0, max: 25, step: 1, suf: "%", show: function () { return isSynth() && cfg.market.jumpLam > 0; } },
      { k: "market.garch", t: "check", label: "Volatility clustering (GARCH)", show: isSynth,
        help: "Quiet periods follow quiet periods. It changes drawdowns far more than it changes averages." }
    ],
    signal: [],
    risk: [
      { k: "shape", t: "seg", label: "Shape the raw signal", opts: [["raw", "As written"], ["sign", "Sign only"], ["z", "Z-score, clipped"], ["tanh", "Squashed"], ["demean", "Market-neutral"]],
        help: "Market-neutral subtracts the cross-sectional mean each day, so the universe's common move cancels. It needs more than one asset." },
      { k: "smooth", t: "range", label: "Smooth over", min: 0, max: 60, step: 1, suf: " d",
        help: "The cheapest turnover reduction there is. Try it before touching anything else." },
      { k: "sizing", t: "seg", label: "How much to hold", opts: [["vol", "Volatility target"], ["linear", "Proportional"], ["flat", "Fixed size"], ["kelly", "Fractional Kelly"]] },
      { k: "targetVol", t: "range", label: "Target volatility", min: 2, max: 40, step: 1, suf: "%", show: function () { return cfg.sizing === "vol"; } },
      { k: "kellyFrac", t: "range", label: "Fraction of Kelly", min: 5, max: 100, step: 5, suf: "%", show: function () { return cfg.sizing === "kelly"; } },
      { k: "volWin", t: "range", label: "Volatility estimated over", min: 10, max: 250, step: 5, suf: " d" },
      { k: "maxLev", t: "range", label: "Maximum leverage", min: 0.25, max: 10, step: 0.25, dec: 2, suf: "×" },
      { k: "ddLimit", t: "range", label: "De-risk at drawdown of", min: 0, max: 60, step: 5, suf: "%",
        help: "0 switches it off. Anything else scales the whole book down as the drawdown deepens and restores it on the way back." },
      { k: "stop", t: "range", label: "Per-position stop", min: 0, max: 40, step: 1, suf: "%",
        help: "0 switches it off. Stops usually cost a systematic strategy money; measure it rather than assuming." },
      { k: "execLag", t: "seg", label: "Execution lag", opts: [["1", "1 bar (honest)"], ["2", "2 bars"], ["3", "3 bars"], ["0", "0 — cheat"]],
        help: "One bar means the signal computed at last night's close trades on today's move. Zero means it trades on the move it already saw." }
    ],
    costs: [
      { k: "spreadBps", t: "range", label: "Half-spread paid per unit traded", min: 0, max: 50, step: 1, suf: " bp" },
      { k: "impactBps", t: "range", label: "Impact coefficient", min: 0, max: 80, step: 1, suf: " bp",
        help: "Charged as coefficient × |Δw|^1.5, the square-root law of Volume 2.3 written in return terms." },
      { k: "financeBps", t: "range", label: "Financing on gross exposure", min: 0, max: 400, step: 10, suf: " bp/y" }
    ]
  };

  function renderCtrl(c) {
    if (c.show && !c.show()) return "";
    var v = E.getPath(cfg, c.k);
    var id = "fg_" + c.k.replace(/\./g, "_");
    var help = c.help ? '<span class="fg-help" title="' + esc(c.help) + '" aria-label="' + esc(c.help) + '">?</span>' : "";
    if (c.t === "seg") {
      var h = '<div class="fg-ctl"><div class="fg-lab">' + esc(c.label) + help + "</div><div class=\"fg-seg\" role=\"group\">";
      c.opts.forEach(function (o) {
        var on = String(v) === String(o[0]);
        h += '<button type="button" class="fg-sg' + (on ? " on" : "") + '" data-k="' + esc(c.k) +
          '" data-v="' + esc(o[0]) + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
      });
      return h + "</div></div>";
    }
    if (c.t === "check") {
      return '<div class="fg-ctl"><label class="fg-check"><input type="checkbox" data-k="' + esc(c.k) + '"' +
        (v ? " checked" : "") + '> <span>' + esc(c.label) + "</span>" + help + "</label></div>";
    }
    var dec = c.dec === undefined ? 0 : c.dec;
    return '<div class="fg-ctl"><label class="fg-lab" for="' + id + '">' + esc(c.label) + help +
      '<output id="' + id + '_o">' + Number(v).toFixed(dec) + (c.suf || "") + "</output></label>" +
      '<input id="' + id + '" type="range" data-k="' + esc(c.k) + '" data-dec="' + dec + '" data-suf="' + esc(c.suf || "") +
      '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + v + '"></div>';
  }

  function renderPanel(name) {
    return CTRLS[name].map(renderCtrl).join("");
  }

  /* ---------- the signal panel is bespoke ---------- */
  function renderSignal() {
    var h = '<div class="fg-ctl"><div class="fg-lab">Start from a known strategy</div><div class="fg-presets">';
    Object.keys(E.PRESETS).forEach(function (k) {
      var p = E.PRESETS[k];
      h += '<button type="button" class="chip fg-preset' + (cfg.preset === k ? " on" : "") +
        '" data-preset="' + esc(k) + '" aria-pressed="' + (cfg.preset === k) + '" title="' + esc(p.note) + '">' +
        esc(p.name) + "</button>";
    });
    h += "</div></div>";
    if (cfg.preset && E.PRESETS[cfg.preset]) {
      var p2 = E.PRESETS[cfg.preset];
      h += '<div class="fg-presetnote">' + esc(p2.note) + ' <span class="fg-vol">' + esc(p2.vol) + "</span></div>";
    }
    h += '<div class="fg-ctl"><label class="fg-lab" for="fgExpr">The signal, as an expression' +
      '<span class="fg-help" title="Every operator from Volume 22 is available, so a catalogue alpha can be pasted in unchanged.">?</span>' +
      "</label>" +
      '<textarea id="fgExpr" class="fg-expr" spellcheck="false" rows="3">' + esc(cfg.expr) + "</textarea>" +
      '<div class="fg-parse" id="fgParse"></div></div>';

    var keys = Object.keys(cfg.params || {});
    if (keys.length) {
      h += '<div class="fg-ctl"><div class="fg-lab">Parameters found in the expression</div><div class="fg-params">';
      keys.forEach(function (k) {
        h += '<label class="fg-param"><span>' + esc(k) + '</span><input type="number" data-param="' + esc(k) +
          '" value="' + esc(cfg.params[k]) + '" min="1" max="2000" step="1"></label>';
      });
      h += "</div><div class=\"fg-hint\">Write <code>{name}</code> anywhere in the expression and it becomes a parameter you can sweep.</div></div>";
    }
    h += '<details class="fg-ref"><summary>Every operator available</summary><div class="fg-refbody">' + opRef() + "</div></details>";
    return h;
  }

  function opRef() {
    var groups = [
      ["Data", "close, open, high, low, volume, vwap, returns, cap, adv{n} — for example adv20"],
      ["Time series", "delay(x,d), delta(x,d), sum(x,d), mean(x,d), ema(x,d), stddev(x,d), ts_min(x,d), ts_max(x,d), ts_argmin(x,d), ts_argmax(x,d), ts_rank(x,d), decay_linear(x,d), zscore(x,d), slope(x,d), rsi(x,d), product(x,d), correlation(x,y,d), covariance(x,y,d)"],
      ["Across assets", "rank(x), scale(x,a), demean(x), cs_zscore(x) — these need more than one asset"],
      ["Maths", "abs, log, exp, sqrt, sign, tanh, signedpower(x,a), power(x,y), clip(x,lo,hi), min(x,y), max(x,y)"],
      ["Operators", "+ − * / ^ &nbsp; &lt; &gt; &lt;= &gt;= == != &nbsp; &amp;&amp; || &nbsp; and the conditional a ? b : c"]
    ];
    return groups.map(function (g) {
      return '<div class="fg-refg"><b>' + g[0] + "</b><code>" + g[1] + "</code></div>";
    }).join("");
  }

  /* ---------- CSV panel ---------- */
  function renderData() {
    var st = userPanel
      ? '<div class="fg-ok">Loaded: <b>' + esc(userPanel.names.join(", ")) + "</b> · " + userPanel.T + " bars</div>'"
      : '<div class="fg-hint">Nothing imported yet.</div>';
    return '<div class="fg-ctl"><div class="fg-lab">Paste a CSV, or drop a file below</div>' +
      '<textarea id="fgCSV" class="fg-csv" spellcheck="false" rows="6" placeholder="date,close&#10;2019-01-02,157.92&#10;2019-01-03,142.19&#10;&#8230;&#10;&#10;Also accepted: date,open,high,low,close,volume &#8212; or a date column followed by one price column per asset."></textarea>' +
      '<div class="fg-row"><button type="button" class="btn-plain" id="fgLoadCSV">Load this data</button>' +
      '<button type="button" class="btn-plain" id="fgPickCSV">Choose a file…</button>' +
      '<input type="file" id="fgFile" accept=".csv,.txt,.tsv" hidden></div>' +
      '<div id="fgCSVStatus" class="fg-status">' + st + "</div>" +
      '<div class="fg-hint">Nothing is uploaded anywhere. The file is read in your browser and stays there.</div></div>';
  }

  /* ============================================================
     Wiring
     ============================================================ */
  var root = null, tabNow = "market";

  function paint() {
    var body = $("#fgBody", root);
    if (!body) return;
    var h = "";
    if (tabNow === "market") h = (isSynth() ? renderPanel("market") : renderCtrl(CTRLS.market[0]) + renderData());
    else if (tabNow === "signal") h = renderSignal();
    else if (tabNow === "risk") h = renderPanel("risk");
    else if (tabNow === "costs") h = renderPanel("costs");
    body.innerHTML = h;
    $$(".fg-tab", root).forEach(function (b) {
      var on = b.getAttribute("data-tab") === tabNow;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (tabNow === "signal") checkParse();
    updateTrials();
  }

  function updateTrials() {
    var n = $("#fgTrials", root);
    if (n) n.textContent = String(state.trials);
    var w = $("#fgTrialWarn", root);
    if (w) w.style.display = state.trials >= 20 ? "" : "none";
  }

  function syncParams() {
    // keep cfg.params in step with the {placeholders} actually present
    var found = {}, m, re = /\{(\w+)\}/g;
    while ((m = re.exec(cfg.expr))) found[m[1]] = true;
    var next = {};
    Object.keys(found).forEach(function (k) {
      next[k] = (cfg.params && cfg.params[k] !== undefined) ? cfg.params[k] : 20;
    });
    cfg.params = next;
  }

  function checkParse() {
    var box = $("#fgParse", root);
    if (!box) return true;
    try {
      E.parse(E.expandExpr(cfg.expr, cfg.params));
      box.className = "fg-parse ok";
      box.textContent = "Parses.";
      return true;
    } catch (e) {
      box.className = "fg-parse err";
      box.textContent = e.message + (e.pos !== undefined ? "  (at character " + (e.pos + 1) + ")" : "");
      return false;
    }
  }

  function setStatus(msg, cls) {
    var s = $("#fgStatus", root);
    if (s) { s.textContent = msg || ""; s.className = "fg-runstatus " + (cls || ""); }
  }

  /* ---------- the run ---------- */
  function doRun(countTrial) {
    if (!checkParseSilent()) { setStatus("The expression does not parse — see the Signal tab.", "err"); tabNow = "signal"; paint(); return; }
    setStatus("Running…");
    try {
      if (countTrial !== false) { state.trials++; save(); }
      var res = E.run(clone(cfg), userPanel, Math.max(1, state.trials));
      lastRun = res;
      /* When the lag is zero, run the honest twin as well. Being told that
         lookahead inflates a result is much weaker than being shown the two
         numbers side by side. */
      honestTwin = null;
      if (cfg.execLag === 0) {
        try {
          var hc = clone(cfg); hc.execLag = 1;
          honestTwin = E.run(hc, userPanel, Math.max(1, state.trials)).m;
        } catch (e2) { honestTwin = null; }
      }
      renderResults();
      updateTrials();
      setStatus("");
      markGuide("run");
      if (cfg.execLag === 0) { state.seenPeek = true; save(); markGuide("peek"); }
    } catch (e) {
      setStatus(e.message, "err");
      var r = $("#fgResults", root);
      if (r) r.innerHTML = '<div class="fg-verdict bad"><div class="fg-vh">It did not run</div><ul><li>' + esc(e.message) + "</li></ul></div>";
    }
  }
  function checkParseSilent() {
    try { E.parse(E.expandExpr(cfg.expr, cfg.params)); return true; } catch (e) { return false; }
  }

  function statTile(v, k, tone) {
    return '<div class="stat' + (tone ? " " + tone : "") + '"><div class="v">' + v + '</div><div class="k">' + esc(k) + "</div></div>";
  }

  function renderResults() {
    var res = lastRun; if (!res) return;
    var m = res.m;
    var h = "";

    h += '<div class="fg-mkt">' + esc(res.panel.label) + " · " + res.panel.N +
      (res.panel.N === 1 ? " asset" : " assets") + " · " + fmt(m.years, 1) + " years" +
      (cfg.execLag === 0 ? ' <span class="fg-cheat">lookahead on</span>' : "") + "</div>";

    h += '<div class="statgrid fg-stats">';
    h += statTile(fmt(m.sharpe), "Sharpe, net", m.sharpe > 0.5 ? "good" : (m.sharpe < 0 ? "bad" : ""));
    h += statTile(pct(m.cagr), "Return a year");
    h += statTile(pct(m.vol), "Volatility");
    h += statTile(pct(m.maxDD, 0), "Worst drawdown", m.maxDD < -0.3 ? "bad" : "");
    h += statTile(fmt(m.calmar), "Return / worst loss");
    h += statTile(fmt(m.turnover, 0) + "×", "Turnover a year");
    h += statTile(fmt(m.tstat), "t-statistic", Math.abs(m.tstat) < 2 ? "bad" : "good");
    h += statTile(pct(m.dsr, 0), "Deflated Sharpe", m.dsr < 0.5 ? "bad" : (m.dsr > 0.9 ? "good" : ""));
    h += "</div>";

    h += verdict(res);

    h += '<figure class="fg-fig"><figcaption>Equity, logarithmic. ' +
      (lastWF ? "The dashed line is the stitched out-of-sample record." : "One unit invested at the start.") +
      "</figcaption>" + chartEquity(res, lastWF && lastWF.eq) + "</figure>";
    h += '<figure class="fg-fig"><figcaption>Depth below the previous peak. The horizontal distance matters more than the vertical: ' +
      "the longest stretch under water here is " + Math.round(m.ddLen / 21) + " months.</figcaption>" + chartUnderwater(res) + "</figure>";
    h += '<figure class="fg-fig"><figcaption>Position held, first asset. Flat stretches are the risk rules doing their job.</figcaption>' +
      chartPosition(res) + "</figure>";

    var roll = chartRolling(res);
    if (roll) h += '<figure class="fg-fig"><figcaption>Rolling one-year Sharpe. A real edge still spends whole years negative; ' +
      "this is what you would have had to sit through.</figcaption>" + roll + "</figure>";

    h += '<div class="fg-grid2">';
    h += '<figure class="fg-fig"><figcaption>Daily returns against a normal with the same mean and spread.</figcaption>' + chartHist(res) + "</figure>";
    h += '<figure class="fg-fig"><figcaption>Where the gross return went.</figcaption>' + chartCosts(res) + "</figure>";
    h += "</div>";

    h += '<details class="fg-more"><summary>Every number</summary><div class="fg-kv">' +
      kv("Gross Sharpe, before costs", fmt(m.grossSharpe)) +
      kv("Net Sharpe", fmt(m.sharpe)) +
      kv("Sortino", fmt(m.sortino)) +
      kv("Annualised return", pct(m.ann)) +
      kv("Annualised volatility", pct(m.vol)) +
      kv("Worst drawdown", pct(m.maxDD)) +
      kv("Longest time under water", Math.round(m.ddLen / 21) + " months") +
      kv("Average gross leverage", fmt(m.avgLev, 2) + "×") +
      kv("Share of days with a position", pct(m.exposure, 0)) +
      kv("Days up, of days in the market", pct(m.hit, 1)) +
      kv("Skew", fmt(m.skew, 2)) +
      kv("Kurtosis", fmt(m.kurt, 1)) +
      kv("Position changes", String(m.nTrades)) +
      kv("Cost drag a year", pct(m.costDrag, 2)) +
      kv("— of which spread", pct(m.costs.spread / m.years, 2)) +
      kv("— of which impact", pct(m.costs.impact / m.years, 2)) +
      kv("— of which financing", pct(m.costs.finance / m.years, 2)) +
      kv("Runs counted", String(m.trials)) +
      kv("Best Sharpe noise alone would give", fmt(m.expMaxSharpe)) +
      kv("Deflated Sharpe", pct(m.dsr)) +
      kv("Probabilistic Sharpe (no deflation)", pct(m.psr)) +
      "</div></details>";

    if (lastSweep) h += renderSweepBlock();
    if (lastWF) h += renderWFBlock();
    if (lastBoot) h += renderBootBlock();

    $("#fgResults", root).innerHTML = h;
  }
  function kv(k, v) { return '<div class="fg-kvr"><span>' + esc(k) + "</span><b>" + v + "</b></div>"; }

  /* ---------- sweep ---------- */
  function sweepSpec() {
    var pk = Object.keys(cfg.params || {});
    var xKey, xVals, xLabel;
    if (pk.length) {
      xKey = "params." + pk[0];
      var base = Number(cfg.params[pk[0]]) || 20;
      xVals = [];
      for (var i = 0; i < 9; i++) xVals.push(Math.max(2, Math.round(base * (0.25 + i * 0.22))));
      xVals = xVals.filter(function (v, k, a) { return a.indexOf(v) === k; });
      xLabel = pk[0] + " (in the expression)";
    } else {
      xKey = "smooth"; xVals = [0, 2, 3, 5, 8, 12, 20, 30, 45]; xLabel = "smoothing, days";
    }
    var yKey, yVals, yLabel;
    if (cfg.sizing === "vol") { yKey = "targetVol"; yVals = [6, 8, 10, 12, 15, 20, 26]; yLabel = "target volatility, %"; }
    else { yKey = "volWin"; yVals = [20, 40, 60, 90, 120, 180, 250]; yLabel = "volatility window, days"; }
    return { xKey: xKey, xVals: xVals, xLabel: xLabel, yKey: yKey, yVals: yVals, yLabel: yLabel };
  }
  function doSweep() {
    if (!checkParseSilent()) { setStatus("Fix the expression first.", "err"); return; }
    setStatus("Sweeping…");
    setTimeout(function () {
      try {
        var spec = sweepSpec();
        var P = E.getPanel(clone(cfg), userPanel);
        lastSweep = E.sweep(clone(cfg), P, spec, Math.max(1, state.trials));
        lastSweep.spec = spec;
        state.trials += lastSweep.cells; save(); updateTrials();
        setStatus("");
        markGuide("sweep");
        if (!lastRun) doRun(false); else renderResults();
      } catch (e) { setStatus(e.message, "err"); }
    }, 16);
  }
  function renderSweepBlock() {
    var sw = lastSweep, spec = sw.spec;
    var h = '<div class="fg-block"><div class="fg-bh">The parameter surface</div>';
    h += '<figure class="fg-fig"><figcaption>Sharpe ratio net of costs across the grid. Green is positive, ' +
      "red negative, and the gold border marks the best cell — which is the least informative square on the " +
      "chart, because it is the one selection acts on most strongly. Look at the shape instead.</figcaption>" +
      chartHeat(sw, spec) + "</figure>";
    h += '<div class="fg-kv">' +
      kv("Cells evaluated", String(sw.cells)) +
      kv("Best Sharpe on the grid", fmt(sw.best)) +
      kv("Cells with a positive Sharpe", pct(sw.posFrac, 0)) +
      kv("Neighbours of the best keeping half its Sharpe", pct(sw.plateau, 0)) +
      "</div>";
    h += '<div class="fg-note ' + (sw.plateau < 0.4 ? "bad" : "good") + '">' +
      (sw.plateau < 0.4
        ? "A spike. The best cell is surrounded by cells that do not work, which is the signature of a parameter fitted to noise rather than to the market."
        : "A plateau. The result survives moving the parameters, which is the weakest form of evidence worth having — and far more than a single number.") +
      " Every one of these " + sw.cells + " cells has been added to your trial count, because every one of them was a look." +
      "</div></div>";
    return h;
  }

  /* ---------- walk-forward ---------- */
  function doWF() {
    if (!checkParseSilent()) { setStatus("Fix the expression first.", "err"); return; }
    setStatus("Walking forward…");
    setTimeout(function () {
      try {
        var pk = Object.keys(cfg.params || {});
        var key, vals;
        if (pk.length) {
          key = "params." + pk[0];
          var base = Number(cfg.params[pk[0]]) || 20;
          vals = [];
          for (var i = 0; i < 7; i++) vals.push(Math.max(2, Math.round(base * (0.3 + i * 0.28))));
          vals = vals.filter(function (v, k, a) { return a.indexOf(v) === k; });
        } else { key = "smooth"; vals = [0, 3, 5, 10, 20, 40]; }
        var P = E.getPanel(clone(cfg), userPanel);
        lastWF = E.walkForward(clone(cfg), P, { key: key, vals: vals }, 5, 1);
        lastWF.key = key;
        setStatus(""); updateTrials();
        markGuide("wf");
        if (!lastRun) doRun(false); else renderResults();
      } catch (e) { setStatus(e.message, "err"); }
    }, 16);
  }
  function renderWFBlock() {
    var wf = lastWF;
    var h = '<div class="fg-block"><div class="fg-bh">Walk-forward</div>';
    h += '<div class="fg-grid2"><figure class="fg-fig"><figcaption>Each fold: the parameter chosen on the past, then what it earned on the future it had not seen. The number under each pair is the parameter that won.</figcaption>' + chartWF(wf) + "</figure>";
    h += '<div><div class="fg-kv">' +
      kv("Parameter optimised", esc(wf.key.replace("params.", ""))) +
      kv("Folds", String(wf.folds)) +
      kv("Average in-sample Sharpe", fmt(wf.avgIS)) +
      kv("Out-of-sample Sharpe, stitched", fmt(wf.oos)) +
      kv("Retained out of sample", pct(Math.max(0, wf.decay), 0)) +
      kv("Worst out-of-sample drawdown", pct(wf.maxDD, 0)) +
      kv("Parameters chosen", wf.picks.join(", ")) +
      "</div></div></div>";
    h += '<div class="fg-note ' + (wf.decay < 0.35 ? "bad" : "good") + '">' +
      (wf.decay < 0.35
        ? "The parameter that worked on each past does not work on the future that followed it. That is what fitting to noise looks like from the inside, and it is the ordinary case."
        : "The choice made on the past kept working on the future. Note that the out-of-sample number, not the in-sample one, is the honest estimate — and it is still an estimate.") +
      (wf.picks.length > 2 && new Set(wf.picks).size > wf.picks.length / 2
        ? " The chosen parameter also jumps around between folds, which means there is no stable best value to find."
        : "") +
      "</div></div>";
    return h;
  }

  /* ---------- bootstrap ---------- */
  function doBoot() {
    if (!lastRun) { setStatus("Run the strategy first.", "err"); return; }
    setStatus("Resampling…");
    setTimeout(function () {
      try {
        lastBoot = E.bootstrap(lastRun.bt, 600, 20, 11);
        setStatus(""); markGuide("boot"); renderResults();
      } catch (e) { setStatus(e.message, "err"); }
    }, 16);
  }
  function renderBootBlock() {
    var b = lastBoot;
    var h = '<div class="fg-block"><div class="fg-bh">The same edge, a thousand other histories</div>';
    h += '<div class="fg-grid2"><figure class="fg-fig"><figcaption>Sharpe ratios from ' + b.iters +
      " resampled histories, drawn in blocks of twenty days so volatility clustering survives the shuffle.</figcaption>" +
      chartBoot(b) + "</figure><div><div class=\"fg-kv\">" +
      kv("Median Sharpe", fmt(b.sharpeP50)) +
      kv("5th percentile", fmt(b.sharpeP05)) +
      kv("95th percentile", fmt(b.sharpeP95)) +
      kv("Median worst drawdown", pct(b.ddP50, 0)) +
      kv("Chance of ending below where you started", pct(b.pLoss, 0)) +
      "</div></div></div>";
    h += '<div class="fg-note">The single history you backtested is one draw from this distribution. If the fifth percentile ' +
      "is a number you could not live with, the strategy is not sized correctly, however good the average looks.</div></div>";
    return h;
  }

  /* ---------- export ---------- */
  function doExport() {
    var spec = JSON.stringify({ version: 1, trials: state.trials, cfg: cfg }, null, 2);
    var py = buildPython();
    var body = '<div class="fg-exp">' +
      '<div class="fg-exprow"><button class="btn-plain" data-dl="py">Download strategy.py</button>' +
      '<button class="btn-plain" data-dl="json">Download spec.json</button>' +
      '<button class="btn-plain" data-dl="csv">Download the prices</button>' +
      '<button class="btn-plain" data-dl="copy">Copy the Python</button></div>' +
      '<div class="fg-hint">If a download does not start, the text is below — select it and copy. ' +
      "Exporting the prices alongside the code is what lets you check the two agree.</div>" +
      '<div class="code"><div class="code-h"><span class="lang">Python</span><span class="spacer"></span>' +
      "<span>reproduces this run</span></div><pre><code id=\"fgPy\">" + esc(py) + "</code></pre></div>" +
      '<details class="fg-more"><summary>The specification</summary><div class="code"><pre><code>' + esc(spec) + "</code></pre></div></details>" +
      "</div>";
    var r = $("#fgResults", root);
    r.innerHTML = body + r.innerHTML;
    r.scrollIntoView({ block: "start", behavior: "smooth" });
    markGuide("export");
  }

  /* ---------- the guided path ---------- */
  var STEPS = [
    { k: "run", t: "Press <b>Run</b>. You now have a backtest.", d: "The default is a 120-day momentum rule on a market that really does trend, with realistic costs." },
    { k: "seed", t: "Change only the <b>seed</b> and run again. Then again.", d: "Same strategy, same market, different luck. The spread you see across seeds is the error bar that a single backtest never shows you." },
    { k: "noedge", t: "Set the market to <b>Random walk</b> and run.", d: "There is now provably nothing to find. Whatever Sharpe survives is manufactured by your search." },
    { k: "sweep", t: "Run the <b>parameter sweep</b>.", d: "A real effect is a plateau. A fitted one is a spike surrounded by cells that fail. Watch your trial count jump." },
    { k: "wf", t: "Run the <b>walk-forward</b>.", d: "Choose the parameter on the past only, then trade it on the future. The gap between the two is what your backtest was borrowing." },
    { k: "peek", t: "Set the lookback <b>L to 5</b>, then execution lag to <b>0 — cheat</b>.", d: "A fast momentum rule that has already seen today's move. Sharpe goes from below zero to somewhere near five, and the worst drawdown shrinks to almost nothing. That pair — impossibly good, impossibly smooth — is the signature of the most common bug in backtesting code, and now you have seen it deliberately." },
    { k: "costs", t: "Set the <b>spread to zero</b>, run, then put it back.", d: "Compare the two. On a fast signal the difference is the whole strategy." },
    { k: "boot", t: "Run the <b>bootstrap</b>.", d: "The history you tested is one draw. Look at the fifth percentile and ask whether you could hold on through it." },
    { k: "own", t: "Write your own expression.", d: "Change one operator in the box, or paste an alpha from Volume 22. Nothing here is a black box: every built-in strategy is a line of the same language." },
    { k: "export", t: "<b>Export</b> the Python and the prices.", d: "Run it outside the browser and check the numbers agree. A result you cannot reproduce elsewhere is not a result." }
  ];
  function markGuide(k) {
    if (!state.guide[k]) { state.guide[k] = 1; save(); paintGuide(); }
  }
  function paintGuide() {
    var g = $("#fgGuide", root); if (!g) return;
    var done = STEPS.filter(function (s) { return state.guide[s.k]; }).length;
    var h = '<div class="fg-gh"><span>Start here — ten moves</span><span class="fg-gcount">' + done + " of " + STEPS.length + "</span></div><ol class=\"fg-steps\">";
    STEPS.forEach(function (s) {
      h += '<li class="' + (state.guide[s.k] ? "on" : "") + '"><span class="fg-tick" aria-hidden="true">' +
        (state.guide[s.k] ? "✓" : "") + "</span><div><div class=\"fg-st\">" + s.t + '</div><div class="fg-sd">' + esc(s.d) + "</div></div></li>";
    });
    h += "</ol>";
    if (done >= STEPS.length) h += '<div class="fg-note good">That is the whole method. Everything after this is domain knowledge and patience.</div>';
    g.innerHTML = h;
  }

  /* ---------- events ---------- */
  function onInput(e) {
    var t = e.target;
    var k = t.getAttribute && t.getAttribute("data-k");
    if (k) {
      var v;
      if (t.type === "checkbox") v = t.checked;
      else { v = parseFloat(t.value); if (isNaN(v)) v = 0; }
      E.setPath(cfg, k, v);
      var o = t.parentNode && t.parentNode.querySelector("output");
      if (o && t.type === "range") {
        var dec = parseInt(t.getAttribute("data-dec") || "0", 10);
        o.textContent = Number(t.value).toFixed(dec) + (t.getAttribute("data-suf") || "");
      }
      if (k === "market.seed") markGuide("seed");
      if (k === "spreadBps" && v === 0) markGuide("costs");
      saveCfg();
      if (/^market\.(world|assets|jumpLam|source|garch)$/.test(k) || k === "sizing") paint();
      return;
    }
    if (t.id === "fgExpr") {
      cfg.expr = t.value;
      cfg.preset = null;
      syncParams();
      checkParse();
      saveCfg();
      markGuide("own");
      return;
    }
    var pk = t.getAttribute && t.getAttribute("data-param");
    if (pk) {
      var pv = parseFloat(t.value);
      cfg.params[pk] = isNaN(pv) ? 1 : pv;
      checkParse(); saveCfg();
    }
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest("[data-k],[data-preset],[data-tab],[data-dl],[data-act]") : null;
    if (!t) return;

    var tab = t.getAttribute("data-tab");
    if (tab) { tabNow = tab; paint(); return; }

    var seg = t.getAttribute("data-k");
    if (seg && t.classList.contains("fg-sg")) {
      var raw = t.getAttribute("data-v");
      var v = (raw === "synthetic" || raw === "csv" || isNaN(parseFloat(raw))) ? raw : parseFloat(raw);
      if (seg === "market.source" || seg === "market.world" || seg === "shape" || seg === "sizing") v = raw;
      E.setPath(cfg, seg, v);
      if (seg === "market.world" && raw === "iid") markGuide("noedge");
      if (seg === "execLag" && Number(raw) === 0) markGuide("peek");
      saveCfg(); paint();
      return;
    }

    var pre = t.getAttribute("data-preset");
    if (pre && E.PRESETS[pre]) {
      var P0 = E.PRESETS[pre];
      cfg.preset = pre;
      cfg.expr = P0.expr;
      cfg.params = clone(P0.params || {});
      // a cross-sectional strategy is nonsense on one asset, so widen the universe with it
      if (P0.assets && cfg.market.source !== "csv" && cfg.market.assets < P0.assets) cfg.market.assets = P0.assets;
      if (P0.shape) cfg.shape = P0.shape;
      syncParams(); saveCfg(); paint();
      return;
    }

    var dl = t.getAttribute("data-dl");
    if (dl) {
      if (dl === "py") download("strategy.py", buildPython(), "text/x-python");
      else if (dl === "json") download("spec.json", JSON.stringify({ version: 1, trials: state.trials, cfg: cfg }, null, 2), "application/json");
      else if (dl === "csv") download("prices.csv", buildDataCSV(), "text/csv");
      else if (dl === "copy") {
        var code = $("#fgPy");
        if (code && navigator.clipboard) navigator.clipboard.writeText(code.textContent).then(function () { t.textContent = "Copied"; setTimeout(function () { t.textContent = "Copy the Python"; }, 1400); });
      }
      return;
    }

    var act = t.getAttribute("data-act");
    if (act === "run") doRun(true);
    else if (act === "sweep") doSweep();
    else if (act === "wf") doWF();
    else if (act === "boot") doBoot();
    else if (act === "export") doExport();
    else if (act === "resetTrials") {
      window.__QC_ASK__("Resetting the trial count does not unsee the variants you have already tried. It only makes the deflated Sharpe flatter you. Reset anyway?")
        .then(function (ok) {
          if (!ok) return;
          state.trials = 0; save(); updateTrials(); if (lastRun) doRun(false);
        });
    } else if (act === "resetAll") {
      cfg = clone(DEFAULT_CFG); lastSweep = lastWF = lastBoot = null; saveCfg(); paint(); doRun(false);
    } else if (act === "loadcsv") loadCSVText($("#fgCSV", root) ? $("#fgCSV", root).value : "");
    else if (act === "pickcsv") { var f = $("#fgFile", root); if (f) f.click(); }
  }

  function loadCSVText(text) {
    var st = $("#fgCSVStatus", root);
    try {
      userPanel = E.fromCSV(text);
      cfg.market.source = "csv";
      if (st) st.innerHTML = '<div class="fg-ok">Loaded <b>' + esc(userPanel.names.join(", ")) + "</b> · " +
        userPanel.T + " bars · " + userPanel.N + (userPanel.N === 1 ? " series" : " series") + "</div>";
      saveCfg();
      doRun(false);
    } catch (e) {
      if (st) st.innerHTML = '<div class="fg-err">' + esc(e.message) + "</div>";
    }
  }

  function saveCfg() { state.cfg = cfg; save(); }

  /* ---------- boot ---------- */
  function boot() {
    root = $("#forge");
    if (!root) return;
    load();
    cfg = state.cfg ? mergeCfg(clone(DEFAULT_CFG), state.cfg) : clone(DEFAULT_CFG);
    syncParams();

    root.innerHTML =
      '<div class="fg-head">' +
      '<div><div class="fg-title">The Forge</div>' +
      '<div class="fg-sub">Build a strategy, run it, and find out how much of the result is yours and how much is the search.</div></div>' +
      '<div class="fg-trialbox"><div class="fg-tn"><b id="fgTrials">0</b> runs counted</div>' +
      '<button type="button" class="fg-mini" data-act="resetTrials">reset</button>' +
      '<div class="fg-tw" id="fgTrialWarn" style="display:none">every run raises the bar</div></div>' +
      "</div>" +
      '<div class="fg-guide" id="fgGuide"></div>' +
      '<div class="fg-tabs" role="tablist">' +
      ['market,Market', 'signal,Signal', 'risk,Sizing &amp; risk', 'costs,Costs'].map(function (s) {
        var p = s.split(",");
        return '<button type="button" class="fg-tab" role="tab" data-tab="' + p[0] + '" aria-selected="false">' + p[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="fg-body" id="fgBody"></div>' +
      '<div class="fg-actions">' +
      '<button type="button" class="btn-study btn-lg" data-act="run">Run</button>' +
      '<button type="button" class="btn-plain" data-act="sweep">Parameter sweep</button>' +
      '<button type="button" class="btn-plain" data-act="wf">Walk-forward</button>' +
      '<button type="button" class="btn-plain" data-act="boot">Bootstrap</button>' +
      '<button type="button" class="btn-plain" data-act="export">Export</button>' +
      '<button type="button" class="fg-mini" data-act="resetAll">reset everything</button>' +
      '<span class="fg-runstatus" id="fgStatus"></span>' +
      "</div>" +
      '<div class="fg-results" id="fgResults"></div>';

    root.addEventListener("input", onInput);
    root.addEventListener("change", function (e) {
      if (e.target.id === "fgFile" && e.target.files && e.target.files[0]) {
        var fr = new FileReader();
        fr.onload = function () { loadCSVText(String(fr.result)); };
        fr.readAsText(e.target.files[0]);
      } else onInput(e);
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("#fgLoadCSV,#fgPickCSV");
      if (b) { if (b.id === "fgLoadCSV") loadCSVText($("#fgCSV", root).value); else $("#fgFile", root).click(); return; }
      onClick(e);
    });
    // drag and drop a CSV anywhere on the lab
    root.addEventListener("dragover", function (e) { e.preventDefault(); root.classList.add("drag"); });
    root.addEventListener("dragleave", function () { root.classList.remove("drag"); });
    root.addEventListener("drop", function (e) {
      e.preventDefault(); root.classList.remove("drag");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { tabNow = "market"; cfg.market.source = "csv"; paint(); loadCSVText(String(fr.result)); };
      fr.readAsText(f);
    });

    paint();
    paintGuide();
    doRun(false);          // a first result without charging a trial
  }

  function mergeCfg(base, over) {
    Object.keys(over || {}).forEach(function (k) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && base[k] && typeof base[k] === "object")
        mergeCfg(base[k], over[k]);
      else base[k] = over[k];
    });
    return base;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
(function () {
  "use strict";
  if (!window.__CALC__ || !window.__CALC__.FN) return;
  var FN = window.__CALC__.FN;
  function fmt(x, d) {
    if (!isFinite(x)) return "&infin;";
    d = d === undefined ? 2 : d;
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function dol(x) { return "$" + fmt(Math.round(x), 0); }
  function pct(x, d) { return fmt(x * 100, d === undefined ? 1 : d) + "%"; }
  function row(k, v, tone) { return '<div class="cr ' + (tone || "") + '"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function verdict(t, tone) { return '<div class="cv ' + (tone || "") + '">' + t + '</div>'; }
  function meter(v, label, tone) {
    v = Math.max(0, Math.min(1, v));
    return '<div class="cm"><div class="cm-l">' + label + '</div>'
         + '<div class="cm-t"><i class="' + (tone || "") + '" style="width:' + (v * 100).toFixed(1) + '%"></i></div></div>';
  }
  function idmFor(n) {
    if (n <= 1) return 1.0; if (n <= 2) return 1.2; if (n <= 3) return 1.35;
    if (n <= 4) return 1.5;  if (n <= 6) return 1.7; if (n <= 8) return 2.0;
    if (n <= 12) return 2.2; if (n <= 20) return 2.4; return 2.5;
  }

  /* ---- 0.12 Method A: risk per trade ---- */
  FN.riskper = function (p) {
    var A = p.acct, f = p.risk / 100, entry = p.entry, stopPct = p.stopdist / 100;
    var perShare = entry * stopPct;
    var money = A * f;
    var shares = perShare > 0 ? Math.floor(money / perShare) : 0;
    var posval = shares * entry, share = A > 0 ? posval / A : 0;
    return row("Money you are willing to lose", dol(money))
      + row("Stop is " + pct(stopPct, 1) + " away, so risk per share", "$" + fmt(perShare, 2))
      + row("Shares the rule gives you", fmt(shares, 0), shares === 0 ? "neg" : "")
      + row("Position value", dol(posval))
      + row("Position as a share of the account", pct(share), share > 0.35 ? "neg" : "")
      + meter(Math.min(1, share / 0.5), "Concentration in this one position", share > 0.35 ? "bad" : "good")
      + verdict(
          shares === 0
            ? "<b>Zero shares.</b> The account is too small for this stop distance unless your broker offers fractional shares. That is information, not a reason to round up to one."
            : (share > 0.35
              ? "<b>Look at the concentration.</b> Your risk per trade is only " + pct(f) + ", yet this single position is "
                + pct(share) + " of everything you have. That is what a tight stop does: it is arithmetically correct and it "
                + "means ordinary daily noise will stop you out, at full size, repeatedly. Widen the stop to where the idea "
                + "is genuinely wrong and let the size fall out."
              : "Sane. Risk per trade " + pct(f) + ", position " + pct(share) + " of the account. Move the stop distance "
                + "slider down and watch the position grow &mdash; the risk stays fixed, the concentration does not."),
          shares === 0 ? "bad" : (share > 0.35 ? "bad" : "good"));
  };

  /* ---- 0.12 Method B: volatility targeting, and whether the instrument fits ---- */
  FN.sizevol = function (p) {
    var A = p.acct, tau = p.tau / 100, n = Math.max(1, Math.round(p.n));
    var sig = p.sig / 100, V = p.unit;
    var idm = idmFor(n), w = 1 / n;
    var riskUnit = sig * V;
    var budget = A * tau * w * idm;
    var raw = riskUnit > 0 ? budget / riskUnit : 0;
    var units = Math.floor(raw);
    var minAcct = riskUnit / (tau * w * idm);
    var volOne = (riskUnit * n) / (idm * A);
    return row("Diversification multiplier for " + n + " instruments", "&times;" + fmt(idm, 2), "muted")
      + row("Annual risk carried by one unit", dol(riskUnit))
      + row("Annual risk budget for this instrument", dol(budget))
      + row("Units the rule gives", fmt(raw, 2) + " &rarr; " + fmt(units, 0), units === 0 ? "neg" : "")
      + row("Smallest account one unit fits in", dol(minAcct), A >= minAcct ? "pos" : "neg")
      + row("Portfolio volatility if you held one unit anyway", pct(volOne), volOne > tau * 1.5 ? "neg" : "")
      + meter(Math.min(1, A / minAcct), "How close your account is to fitting one unit", A >= minAcct ? "good" : "bad")
      + verdict(
          units === 0
            ? "<b>This instrument does not fit.</b> Not &ldquo;it would be tight&rdquo; &mdash; the smallest tradeable unit "
              + "carries " + fmt(riskUnit / budget, 1) + "&times; more risk than the whole budget for it. Holding one anyway "
              + "puts the book at " + pct(volOne) + " volatility against a " + pct(tau) + " target. The honest choices are a "
              + "bigger account, a smaller instrument, fewer instruments, or a stated higher risk target &mdash; not pretending "
              + "the constraint is absent."
            : "One unit fits, with " + fmt(raw, 2) + " units of budget available. Now raise the instrument's volatility slider: "
              + "everything that fits in a calm market stops fitting in a violent one, which is why the position must be "
              + "recomputed rather than set once.",
          units === 0 ? "bad" : "good");
  };

  /* ---- 0.15 cost-to-edge ---- */
  FN.costedge = function (p) {
    var turn = p.turn, bps = p.bps, gross = p.gross / 100;
    var cost = turn * (bps / 10000) * 2;
    var net = gross - cost;
    var share = gross > 0 ? cost / gross : 99;
    return row("Annual turnover", fmt(turn, 1) + "&times; the account")
      + row("All-in cost per side", fmt(bps, 0) + " bp")
      + row("Annual cost of trading", "&minus;" + pct(cost), "neg")
      + row("Expected gross return", pct(gross), "muted")
      + row("Expected net return", pct(net), net > 0 ? "pos" : "neg")
      + row("Costs as a share of gross", pct(share, 0), share > 0.2 ? "neg" : "pos")
      + meter(Math.min(1, share), "Share of your edge going to costs", share > 0.2 ? "bad" : "good")
      + verdict(
          share >= 1
            ? "<b>The strategy is dead.</b> Costs exceed the entire gross return, so it loses money by construction and no "
              + "improvement to the signal can rescue it. Only three things help: less turnover, a cheaper instrument, or a "
              + "different strategy."
            : (share > 0.2
              ? "<b>Costs are eating " + pct(share, 0) + " of your edge.</b> Above roughly a fifth, the highest-return work "
                + "available to you is reducing turnover &mdash; a rebalance buffer, a slower signal, a weekly instead of a "
                + "daily cycle &mdash; not improving the forecast."
              : "Comfortable. Costs take " + pct(share, 0) + " of gross. Now halve the assumed gross return, which is roughly "
                + "what deflating for your trial count will do to it (18.2), and look at this number again."),
          share >= 1 ? "bad" : (share > 0.2 ? "bad" : "good"));
  };

  if (window.__CALC__.init) window.__CALC__.init();
})();

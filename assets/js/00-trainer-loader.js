/* ==========================================================================
   THE TRAINER — deferred loading

   The practice engine is 1.6 MB of generators, banks and scheduling: more
   than the rest of the page put together, and none of it is needed to read a
   lesson. It is pulled out of the critical path here and fetched when the
   reader first reaches for it, or at idle if they never do.

   Two things have to hold for the rest of the page not to notice.

   1. `window.__TRAINER__` must exist from the first frame. The course layer
      captures it once, at boot, and keeps that reference for the life of the
      page — so a stub that later forwards to the real engine is installed as
      a getter, and the engine's own assignment is caught by the setter.

   2. Whoever set event ownership before this file loads must get it back.
      Block 77 of the original document handed ownership back to nobody after
      the trainer registered its listeners; that line now runs long before the
      trainer arrives, so the trainer bundle hands ownership back itself.
   ========================================================================== */
(function () {
  "use strict";

  var SRC = "assets/js/90-trainer.js";
  var REAL = null, started = false, settled = false, waiting = [];

  function flush() {
    settled = true;
    /* The Path button asked the trainer how many items it had before there was
       a trainer to ask. Its own refresh runs on visibilitychange; this is the
       cheapest honest way to make it ask again. */
    try { document.dispatchEvent(new Event("visibilitychange")); } catch (e) {}
    try { window.dispatchEvent(new Event("qc:trainer-ready")); } catch (e) {}
    var q = waiting; waiting = [];
    for (var i = 0; i < q.length; i++) { try { q[i](REAL); } catch (e) {} }
  }

  function load() {
    if (started) return;
    started = true;
    var s = document.createElement("script");
    s.src = SRC;
    s.async = false;                 /* deterministic order against anything else */
    s.onload = flush;
    s.onerror = function () { flush(); };   /* offline: degrade, never hang */
    (document.head || document.documentElement).appendChild(s);
  }

  function ready(cb) { if (settled) cb(REAL); else { waiting.push(cb); load(); } }

  /* The face the rest of the page sees. Every method is safe before the
     engine exists and identical to it afterwards. */
  var STUB = {
    run: function (vols, len, cb) {
      ready(function (T) {
        if (T && T.run) T.run(vols, len, cb);
        else if (typeof cb === "function") cb({ n: 0, ok: 0 });
      });
    },
    count: function (vols) {
      try { return REAL && REAL.count ? REAL.count(vols) : 0; } catch (e) { return 0; }
    },
    due: function () {
      try { return REAL && REAL.due ? REAL.due() : 0; } catch (e) { return 0; }
    }
  };

  try {
    Object.defineProperty(window, "__TRAINER__", {
      configurable: true,
      get: function () { return STUB; },
      set: function (v) { REAL = v; }
    });
  } catch (e) {
    window.__TRAINER__ = STUB;       /* very old engine: no accessors */
  }

  window.__QC_TRAINER__ = {
    load: load,
    ready: ready,
    loaded: function () { return settled && !!REAL; }
  };

  /* ---- when to fetch it, earliest wins --------------------------------- */

  /* the reader touched the page at all */
  document.addEventListener("pointerdown", load, { capture: true, once: true, passive: true });
  document.addEventListener("keydown", load, { capture: true, once: true });

  /* the trainer view was switched on */
  function watch() {
    var r = document.getElementById("tr-root");
    if (!r) return false;
    if (r.classList.contains("on")) { load(); return true; }
    try {
      new MutationObserver(function (recs, ob) {
        if (r.classList.contains("on")) { load(); ob.disconnect(); }
      }).observe(r, { attributes: true, attributeFilter: ["class"] });
    } catch (e) { load(); }
    return true;
  }
  if (!watch()) {
    var poll = setInterval(function () { if (watch()) clearInterval(poll); }, 150);
    setTimeout(function () { clearInterval(poll); }, 15000);
  }

  /* nobody did anything — take it while the browser is idle */
  function idle() {
    if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 4000 });
    else setTimeout(load, 1500);
  }
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
})();

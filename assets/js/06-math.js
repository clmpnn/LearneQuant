/* ==========================================================================
   TYPESET MATHEMATICS — put back as the reader reaches it

   The build moves every MathJax glyph out of the document and into a data-mjx
   attribute on its own <svg>. The reason is memory, and it is not marginal:
   54% of this document's 102,000 elements are that output — 2,830 <svg>,
   24,544 <g> and 23,308 <use> — and WebKit builds a shadow tree for every
   <use>. Measured in WebKitGTK, the same engine iOS uses, the page cost
   ~507 MB of renderer memory before the reader touched anything, and iOS
   Safari kills a tab for that. With the glyphs held as strings it is ~404 MB
   and 41% fewer nodes.

   An emptied <svg> keeps its width, height and viewBox, so it occupies the
   same box as the full one: measured across 120 visible formulae, emptying
   them changed no box and left the document height identical to the pixel.
   Nothing moves when a formula arrives or leaves.

   Hydration is per lesson rather than per formula. Observing 2,680 individual
   <svg> elements would cost back much of what the deferral saves; observing
   the 368 lesson articles and 53 volume sections costs almost nothing, and it
   lines up with the content-visibility boundaries the document already uses.

   Everything is restored before printing, and immediately if this browser has
   no IntersectionObserver, so the worst case is the document as it was.
   ========================================================================== */
(function () {
  "use strict";

  var ATTR = "mjx";                 /* dataset key: data-mjx */
  var SEL = "svg[data-" + ATTR + "]";
  var HYDRATE_MARGIN = "1500px 0px";
  var DEHYDRATE_MARGIN = "3600px 0px";   /* wider, so the edge cannot flap */

  function fill(svg) {
    if (svg.firstChild) return;                      /* already filled */
    var src = svg.getAttribute("data-" + ATTR);
    if (src == null) return;
    try { svg.innerHTML = src; } catch (e) { /* leave it empty rather than throw */ }
  }
  function empty(svg) {
    if (!svg.firstChild) return;
    if (svg.getAttribute("data-" + ATTR) == null) return;  /* not ours to clear */
    try { svg.textContent = ""; } catch (e) {}
  }

  /* A container's own formulae: those not owned by a lesson nested inside it,
     so a volume and its lessons never fight over the same <svg>. */
  function own(container) {
    var all = container.querySelectorAll(SEL);
    if (container.tagName !== "SECTION") return all;
    var mine = [], i, el;
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (!el.closest("article.lesson")) mine.push(el);
    }
    return mine;
  }

  function apply(container, on) {
    var list = own(container), i;
    for (i = 0; i < list.length; i++) (on ? fill : empty)(list[i]);
  }

  function hydrateAll() {
    var all = document.querySelectorAll(SEL), i;
    for (i = 0; i < all.length; i++) fill(all[i]);
  }

  /* Printing, and find-in-page on some browsers, need everything present. */
  function bindAlwaysOn() {
    if (window.matchMedia) {
      try {
        var mq = window.matchMedia("print");
        var onChange = function (e) { if (e.matches) hydrateAll(); };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);
      } catch (e) {}
    }
    window.addEventListener("beforeprint", hydrateAll);
    /* an escape hatch for anything that needs the whole document rendered */
    window.__QC_MATH__ = { hydrateAll: hydrateAll, selector: SEL };
  }

  function boot() {
    bindAlwaysOn();

    if (!window.IntersectionObserver) { hydrateAll(); return; }

    var hydrator = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) apply(entries[i].target, true);
      }
    }, { rootMargin: HYDRATE_MARGIN });

    var dehydrator = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) apply(entries[i].target, false);
      }
    }, { rootMargin: DEHYDRATE_MARGIN });

    var seen = 0;
    function observe() {
      var containers = document.querySelectorAll(
        "#qr-root article.lesson, #qr-root main.col > section.vol");
      if (containers.length === seen) return;
      seen = containers.length;
      for (var i = 0; i < containers.length; i++) {
        if (containers[i].dataset.mjxWatched === "1") continue;
        containers[i].dataset.mjxWatched = "1";
        hydrator.observe(containers[i]);
        dehydrator.observe(containers[i]);
      }
      /* anything outside a lesson or volume — the preface, the panels — is
         not worth observing individually, so it is simply filled */
      var loose = document.querySelectorAll(SEL), j, el;
      for (j = 0; j < loose.length; j++) {
        el = loose[j];
        if (!el.closest("#qr-root article.lesson, #qr-root main.col > section.vol")) fill(el);
      }
    }
    observe();

    /* The course view builds lesson bodies at runtime, and the trainer writes
       formulae into its questions; both need picking up when they appear. */
    var pending = 0;
    var roots = document.querySelectorAll("#qc-root, #tr-root");
    if (roots.length) {
      var mo = new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () {
          pending = 0;
          var k, added, r;
          for (r = 0; r < roots.length; r++) {
            added = roots[r].querySelectorAll(SEL);
            for (k = 0; k < added.length; k++) fill(added[k]);
          }
        }, 300);
      });
      for (var m = 0; m < roots.length; m++) {
        mo.observe(roots[m], { childList: true, subtree: true });
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* ==========================================================================
   SIDEWAYS-SCROLLING REGIONS — keyboard access, and a visible cue

   The wide tables, code blocks and figures scroll horizontally. Two things
   follow from that, and neither is solvable in CSS alone.

   1. A region you can only reach by scrolling must be reachable from the
      keyboard (WCAG 2.1.1). An audit found 283 such regions on a phone, none
      of them focusable: a keyboard-only reader could not bring the hidden
      columns into view at all. `tabindex="0"` on the scroll container fixes
      that — and unlike the usual wrapper-div pattern it does not touch the
      DOM shape, so a <table> keeps its table role and nothing that queries
      the document finds its structure changed underneath it.

   2. Nothing tells a reader the region scrolls. The clipped text is a hint,
      not an affordance. Marking the element lets the stylesheet draw an edge
      shadow that fades out once the reader reaches the end.

   Both are applied lazily, through an IntersectionObserver with a generous
   margin. That matters: the reference uses content-visibility on all 53
   volumes and 368 lessons, and measuring an element forces it into layout.
   Observing costs nothing until the browser renders a region anyway, so this
   never undoes that work.
   ========================================================================== */
(function () {
  "use strict";

  var SEL = "#qr-root table, #qr-root pre, #qr-root .dia-scroll, " +
            "#tr-root table, #tr-root pre";
  var SEL_LOCAL = "table, pre, .dia-scroll";   /* used inside a known root */
  var MARK = "qcScrollx";          /* dataset flag, so a re-run is a no-op */

  if (!window.IntersectionObserver) return;   /* nothing breaks; CSS still scrolls it */

  function label(el) {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return;
    if (el.tagName === "TABLE") {
      /* a caption already names it; adding aria-label would override that */
      if (el.querySelector("caption")) return;
      el.setAttribute("aria-label", "Table, scrolls sideways");
    } else if (el.tagName === "PRE") {
      el.setAttribute("aria-label", "Code, scrolls sideways");
    } else {
      el.setAttribute("aria-label", "Figure, scrolls sideways");
    }
  }

  /* Does it actually overflow? Only then is it a control the reader needs. */
  function apply(el) {
    var over = el.scrollWidth > el.clientWidth + 1;
    if (over) {
      if (el.dataset[MARK] === "1") return;
      el.dataset[MARK] = "1";
      if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
      el.classList.add("qc-scrollx");
      label(el);
      edge(el);
    } else if (el.dataset[MARK] === "1") {
      /* rotated, or the window grew: it fits now, so stop advertising it */
      delete el.dataset[MARK];
      if (el.getAttribute("tabindex") === "0") el.removeAttribute("tabindex");
      el.classList.remove("qc-scrollx", "qc-scrollx-end");
    }
  }

  /* The cue is an inset shadow on the right edge. Once the reader has scrolled
     to the end there is nothing more to find, so it is taken away again. */
  function edge(el) {
    if (el.dataset.qcScrollBound === "1") return;
    el.dataset.qcScrollBound = "1";
    var frame = 0;
    el.addEventListener("scroll", function () {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        var atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
        el.classList.toggle("qc-scrollx-end", atEnd);
      });
    }, { passive: true });
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        try { apply(entries[i].target); } catch (e) {}
      }
    }
  }, { rootMargin: "800px 0px" });   /* handled well before it is on screen */

  var watched = [];
  function take(found) {
    for (var i = 0; i < found.length; i++) {
      if (found[i].dataset.qcScrollSeen === "1") continue;
      found[i].dataset.qcScrollSeen = "1";
      watched.push(found[i]);
      io.observe(found[i]);
    }
  }

  /* The whole document, once. querySelectorAll does not force layout and
     neither does observe(), so this is cheap even across 100,000 nodes. */
  function collectAll() { take(document.querySelectorAll(SEL)); }

  function boot() {
    collectAll();

    /* After that, only the two roots that are rebuilt at runtime are watched:
       the course view and the trainer. The reference is static markup and
       re-querying it on every mutation would mean sweeping 100,000 nodes
       several times a second while someone works through a drill. */
    window.addEventListener("qc:trainer-ready", collectAll);
    var pending = 0;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () {
        pending = 0;
        var roots = document.querySelectorAll("#qc-root, #tr-root");
        for (var i = 0; i < roots.length; i++) take(roots[i].querySelectorAll(SEL_LOCAL));
      }, 400);
    });
    var roots = document.querySelectorAll("#qc-root, #tr-root");
    for (var i = 0; i < roots.length; i++) {
      mo.observe(roots[i], { childList: true, subtree: true });
    }
  }

  /* Orientation and window changes flip regions in and out of overflowing. */
  var rs = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rs);
    rs = setTimeout(function () {
      for (var i = 0; i < watched.length; i++) {
        /* only the ones currently rendered — skipped content has no layout */
        if (watched[i].offsetParent !== null || watched[i].dataset[MARK] === "1") {
          try { apply(watched[i]); } catch (e) {}
        }
      }
    }, 250);
  }, { passive: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

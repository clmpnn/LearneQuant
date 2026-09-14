/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [4]. Do not reorder: these
   run in document order and several set shared globals. */
/* ==========================================================================
   ASK AND TELL
   Five controls in this document guarded a destructive action with
   window.confirm, and eleven places reported a problem with window.alert.
   Both are suppressed in a sandboxed frame — which is exactly what an
   artifact viewer is — so "Reset the path" ran confirm(), got false back
   without showing anything, and did nothing at all. The button looked dead.

   confirm() cannot be shimmed: it must answer synchronously and an in-page
   dialog cannot. So the call sites ask through here instead and continue in
   a callback. alert() has no return value to honour, so it is replaced.
   Defined before any module that uses it, and styled inline so it never
   depends on a stylesheet that loads later.
   ========================================================================== */
(function () {
  "use strict";
  var OPEN = null;

  function build(msg, withCancel) {
    var wrap = document.createElement("div");
    wrap.className = "qc-ask";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:10200;display:flex;align-items:center;" +
      "justify-content:center;padding:20px;background:rgba(14,16,20,.55)";
    var card = document.createElement("div");
    card.style.cssText =
      "width:min(460px,100%);max-height:100%;overflow:auto;padding:22px;border-radius:12px;" +
      "background:var(--surface,#fff);color:var(--ink,#16181d);border:1px solid var(--rule-strong,#cdc7bc);" +
      "box-shadow:0 12px 40px rgba(0,0,0,.28);" +
      "font-family:var(--sans,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif)";
    var p = document.createElement("p");
    p.style.cssText = "margin:0 0 18px;font-size:15px;line-height:1.6;white-space:pre-wrap";
    p.textContent = msg;
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:9px;justify-content:flex-end";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = withCancel ? "Yes, do it" : "OK";
    ok.style.cssText =
      "appearance:none;font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:11px 18px;" +
      "min-height:44px;border-radius:999px;border:1px solid var(--accent,#8a5d16);" +
      "background:var(--accent,#8a5d16);color:#fff";
    row.appendChild(ok);
    var cancel = null;
    if (withCancel) {
      cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.style.cssText =
        "appearance:none;font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:11px 18px;" +
        "min-height:44px;border-radius:999px;border:1px solid var(--rule-strong,#cdc7bc);" +
        "background:transparent;color:var(--ink-2,#41454d)";
      row.insertBefore(cancel, ok);
    }
    card.appendChild(p); card.appendChild(row); wrap.appendChild(card);
    return { wrap: wrap, ok: ok, cancel: cancel };
  }

  function show(msg, withCancel) {
    return new Promise(function (resolve) {
      if (OPEN) { try { OPEN(); } catch (e) {} }        /* one at a time */
      var d = build(String(msg == null ? "" : msg), withCancel);
      var returnTo = document.activeElement;
      var prevOverflow = document.documentElement.style.overflow;
      function done(v) {
        document.removeEventListener("keydown", onKey, true);
        d.wrap.remove();
        document.documentElement.style.overflow = prevOverflow;
        OPEN = null;
        var id = returnTo && returnTo.id, tries = 0;
        (function land() {
          var el = id ? document.getElementById(id) : returnTo;
          if (el && el.isConnected) { try { el.focus(); } catch (e) {} return; }
          if (tries++ < 8) setTimeout(land, 40);
        })();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape" || e.key === "Esc") {
          e.preventDefault(); e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          done(false); return;
        }
        if (e.key !== "Tab") return;
        var f = [d.cancel, d.ok].filter(Boolean);
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !d.wrap.contains(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !d.wrap.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
      d.ok.addEventListener("click", function () { done(true); });
      if (d.cancel) d.cancel.addEventListener("click", function () { done(false); });
      d.wrap.addEventListener("click", function (e) { if (e.target === d.wrap) done(false); });
      document.addEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = "hidden";
      (document.body || document.documentElement).appendChild(d.wrap);
      (d.cancel || d.ok).focus();
      OPEN = function () { done(false); };
    });
  }

  window.__QC_ASK__  = function (msg) { return show(msg, true); };
  window.__QC_TELL__ = function (msg) { return show(msg, false); };

  /* alert() has no answer to honour, so it can be replaced outright. */
  try { window.alert = function (msg) { show(msg, false); }; } catch (e) {}
})();

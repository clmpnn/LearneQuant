/* The Quant Curriculum — extracted verbatim from the original
   single-file build. Source blocks [14]. Do not reorder: these
   run in document order and several set shared globals. */
/* ============================================================
   QUANT REFERENCE — runtime
   No external dependencies. All math is pre-rendered SVG.
   ============================================================ */
(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- storage (never throw) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- theme ---------- */
  var root = document.documentElement;
  function applyTheme(t) {
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
    var b = $("#themeBtn");
    if (b) {
      var lbl = t === "light" ? "Light" : t === "dark" ? "Dark" : "System";
      b.setAttribute("aria-label", "Colour theme: " + lbl + ". Click to change.");
      b.setAttribute("title", "Theme: " + lbl);
      $("#themeIcon").textContent = t === "light" ? "☀" : t === "dark" ? "☾" : "◐";
    }
  }
  var theme = lsGet("qr-theme") || "system";
  applyTheme(theme);
  var themeBtn = $("#themeBtn");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    lsSet("qr-theme", theme); applyTheme(theme);
  });

  /* ---------- mobile sidebar ---------- */
  var sidebar = $("#sidebar"), scrim = $("#scrim"), burger = $("#burger");
  function setNav(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (scrim) scrim.classList.toggle("on", open);
    if (burger) burger.setAttribute("aria-expanded", String(open));
  }
  if (burger) burger.addEventListener("click", function () { setNav(!sidebar.classList.contains("open")); });
  if (scrim) scrim.addEventListener("click", function () { setNav(false); });

  /* ---------- scroll spy: volumes + on-page TOC ---------- */
  var vols     = $$("section.vol");
  var navItems = $$(".nav-item");
  var navMap   = {};
  navItems.forEach(function (a) {
    var h = a.getAttribute("href");
    if (h && h.charAt(0) === "#") navMap[h.slice(1)] = a;
  });
  var crumb = $("#crumb");
  var tocBox = $("#toc");
  var currentVol = null;

  function buildToc(vol) {
    if (!tocBox) return;
    var heads = $$("h3.sh, h4.ssh", vol);
    if (!heads.length) { tocBox.innerHTML = ""; return; }
    var h = '<h4>On this page</h4>';
    heads.forEach(function (el) {
      if (!el.id) return;
      var t = el.getAttribute("data-t") || el.textContent.replace("¶", "").trim();
      h += '<a href="#' + el.id + '" class="' + (el.tagName === "H4" ? "lvl3" : "") + '">' + esc(t) + "</a>";
    });
    tocBox.innerHTML = h;
  }

  var volObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var id = e.target.id;
      if (id === currentVol) return;
      currentVol = id;
      navItems.forEach(function (a) { a.classList.remove("active"); });
      var a = navMap[id];
      if (a) {
        a.classList.add("active");
        if (crumb) crumb.innerHTML = 'Quant Reference &nbsp;/&nbsp; <b>' + esc(a.getAttribute("data-title") || "") + "</b>";
        var nav = $("#sbnav");
        if (nav) {
          var top = a.offsetTop, h = nav.clientHeight;
          if (top < nav.scrollTop + 40 || top > nav.scrollTop + h - 60) nav.scrollTop = top - h / 2;
        }
      }
      buildToc(e.target);
    });
  }, { rootMargin: "-56px 0px -72% 0px", threshold: 0 });
  vols.forEach(function (v) { volObserver.observe(v); });

  var headObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting || !tocBox) return;
      $$("a", tocBox).forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id);
      });
    });
  }, { rootMargin: "-58px 0px -78% 0px", threshold: 0 });
  $$("h3.sh, h4.ssh").forEach(function (h) { if (h.id) headObserver.observe(h); });

  /* ---------- reading progress ---------- */
  var bar = $("#progress");
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + "%";
      }
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- copy code ---------- */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-copy]") : null;
    if (!b) return;
    var pre = b.closest(".code").querySelector("code");
    var txt = pre ? pre.innerText : "";
    var done = function (ok) {
      var old = b.textContent;
      b.textContent = ok ? "Copied" : "Press ⌘C";
      setTimeout(function () { b.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { fallback(txt, done); });
    } else fallback(txt, done);
  });
  function fallback(txt, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta); done(ok);
    } catch (e) { done(false); }
  }

  /* ---------- nav filter (sidebar box filters volumes when index absent) ---------- */
  var idx = window.__SEARCH_INDEX__ || [];
  var box = $("#q"), results = $("#sr");

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      if (t.length < 2) return;
      out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
    });
    return out;
  }

  var selIdx = -1, curResults = [];
  function runSearch() {
    var qv = box.value.trim();
    if (!qv) { results.classList.remove("on"); results.innerHTML = ""; curResults = []; selIdx = -1;
      navItems.forEach(function (a) { a.classList.remove("hidden"); });
      $$(".nav-part").forEach(function (p) { p.style.display = ""; });
      return; }
    var terms = qv.toLowerCase().split(/\s+/).filter(Boolean);
    var scored = [];
    for (var i = 0; i < idx.length; i++) {
      var it = idx[i], s = 0, hay = it.s;
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j], pos = hay.indexOf(t);
        if (pos === -1) { s = -1; break; }
        s += 10;
        if (it.t.toLowerCase().indexOf(t) !== -1) s += 40;
        if (hay.indexOf(" " + t) !== -1) s += 6;
      }
      if (s > 0) scored.push({ it: it, s: s });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    curResults = scored.slice(0, 30);
    if (!curResults.length) {
      results.innerHTML = '<div class="empty">No matches for “' + esc(qv) + '”</div>';
    } else {
      results.innerHTML = curResults.map(function (r, n) {
        var it = r.it;
        var pos = it.s.indexOf(terms[0]);
        var start = Math.max(0, pos - 42);
        var snip = (start > 0 ? "…" : "") + it.x.slice(start, start + 165) + "…";
        return '<a href="#' + it.id + '" data-n="' + n + '">' +
               '<div class="c">' + esc(it.v) + "</div>" +
               '<div class="t">' + highlight(it.t, terms) + "</div>" +
               '<div class="x">' + highlight(snip, terms) + "</div></a>";
      }).join("");
    }
    selIdx = -1;
    results.classList.add("on");
  }

  if (box) {
    var deb;
    box.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(runSearch, 90); });
    box.addEventListener("keydown", function (e) {
      var links = $$("a", results);
      if (e.key === "Escape") { box.value = ""; runSearch(); box.blur(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!links.length) return;
        e.preventDefault();
        selIdx += e.key === "ArrowDown" ? 1 : -1;
        if (selIdx < 0) selIdx = links.length - 1;
        if (selIdx >= links.length) selIdx = 0;
        links.forEach(function (a, i) { a.classList.toggle("sel", i === selIdx); });
        links[selIdx].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter" && selIdx >= 0 && links[selIdx]) { e.preventDefault(); links[selIdx].click(); }
    });
    results.addEventListener("click", function (e) {
      var a = e.target.closest("a"); if (!a) return;
      results.classList.remove("on"); box.value = ""; setNav(false);
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".sb-search")) results.classList.remove("on");
    });
  }

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if (e.key === "/" && !typing) { e.preventDefault(); if (box) { box.focus(); box.select(); } return; }
    if (e.key === "Escape") { setNav(false); if (results) results.classList.remove("on"); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "j" || e.key === "k") {
      var i = vols.findIndex(function (v) { return v.id === currentVol; });
      if (i === -1) i = 0;
      var n = e.key === "j" ? i + 1 : i - 1;
      if (n >= 0 && n < vols.length) { e.preventDefault(); vols[n].scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    if (e.key === "t") { if (themeBtn) themeBtn.click(); }
    if (e.key === "?") { var d = $("#help"); if (d) { d.open = !d.open; d.scrollIntoView({ block: "center" }); } }
  });

  /* ---------- generic filterable collections (alphas, problems) ---------- */
  $$("[data-filter-scope]").forEach(function (scope) {
    var itemsSel = scope.getAttribute("data-filter-scope");
    var items = $$(itemsSel, scope);
    var qEl = $("[data-f-q]", scope);
    var chips = $$("[data-f-tag]", scope);
    var selEl = $("[data-f-sel]", scope);
    var countEl = $("[data-f-count]", scope);
    var emptyEl = $("[data-f-empty]", scope);
    var active = new Set();

    function apply() {
      var q = qEl ? qEl.value.trim().toLowerCase() : "";
      var sv = selEl ? selEl.value : "";
      var n = 0;
      items.forEach(function (el) {
        var hay = (el.getAttribute("data-search") || el.textContent).toLowerCase();
        var tags = (el.getAttribute("data-tags") || "").split("|");
        var ok = true;
        if (q) { q.split(/\s+/).forEach(function (t) { if (hay.indexOf(t) === -1) ok = false; }); }
        if (ok && active.size) { var hit = false; tags.forEach(function (t) { if (active.has(t)) hit = true; }); ok = hit; }
        if (ok && sv) ok = tags.indexOf(sv) !== -1;
        el.classList.toggle("is-out", !ok);
        if (ok) n++;
      });
      if (countEl) countEl.textContent = n + " of " + items.length;
      if (emptyEl) emptyEl.style.display = n ? "none" : "block";
    }
    if (qEl) { var d2; qEl.addEventListener("input", function () { clearTimeout(d2); d2 = setTimeout(apply, 70); }); }
    if (selEl) selEl.addEventListener("change", apply);
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        var t = c.getAttribute("data-f-tag");
        var on = c.getAttribute("aria-pressed") === "true";
        if (on) { active.delete(t); c.setAttribute("aria-pressed", "false"); }
        else { active.add(t); c.setAttribute("aria-pressed", "true"); }
        apply();
      });
    });
    var expand = $("[data-f-expand]", scope);
    if (expand) expand.addEventListener("click", function () {
      var det = $$("details.sol", scope).filter(function (d) { return !d.closest(".is-out"); });
      var anyClosed = det.some(function (d) { return !d.open; });
      det.forEach(function (d) { d.open = anyClosed; });
      expand.textContent = anyClosed ? "Collapse all" : "Expand all";
    });
    apply();
  });

  /* ---------- print: force all <details> open ---------- */
  var reopen = [];
  window.addEventListener("beforeprint", function () {
    reopen = $$("details").filter(function (d) { return !d.open; });
    reopen.forEach(function (d) { d.open = true; });
  });
  window.addEventListener("afterprint", function () {
    reopen.forEach(function (d) { d.open = false; });
    reopen = [];
  });

  /* ---------- close mobile nav on nav click ---------- */
  navItems.forEach(function (a) { a.addEventListener("click", function () { setNav(false); }); });

  /* ---------- anchor links reveal on focus (a11y) ---------- */
  $$(".anchor").forEach(function (a) {
    a.addEventListener("focus", function () { a.style.opacity = 1; });
    a.addEventListener("blur", function () { a.style.opacity = ""; });
  });
})();

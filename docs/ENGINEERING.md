# LearneQuant — engineering notes

*How the site is built, what was measured, and why each decision went the way it
did. The project's own README is one level up.*

**The Quant Curriculum** — 368 ordered lessons across 53 stages, a complete
reference, and a practice engine of over a thousand generated problems. Every
lesson is open from the start; the order is a recommendation, not a gate.

It is a static site with no build step, no framework and no dependencies. Open
`index.html` and it runs.

---

## How it is published

The site is served by GitHub Pages from the `main` branch, root folder — the
setting under **Settings → Pages**. It is live at
<https://clmpnn.github.io/LearneQuant/>.

Because a branch deploy runs no build step, the public URL is written into the
files themselves rather than stamped in at publish time: the canonical link,
the Open Graph and Twitter tags, the `schema.org` block, `sitemap.xml`,
`robots.txt` and `404.html` all carry the real address. An earlier version left
a `__SITE_URL__` placeholder for a workflow to substitute, which meant the live
page was advertising a literal placeholder to crawlers and link previews.

`.nojekyll` matters here: on a branch deploy Jekyll would otherwise process the
tree and drop anything beginning with an underscore.

### Switching to the Actions workflow instead

`setup.ps1` (or `setup.sh`) writes `.github/workflows/deploy.yml` and, if this
is not already a repository, initialises one. With **Settings → Pages → Source**
set to **GitHub Actions**, that workflow re-stamps the URL, gives the service
worker a per-commit cache id, and refuses to publish if `.nojekyll` has gone
missing, if any JavaScript fails to parse, or if `index.html` points at an asset
that is not in the repository. Its URL substitution is a harmless no-op now that
the real address is already in place.

### A custom domain

Put the bare hostname in a `CNAME` file at the root, push, and set the same
domain under **Settings → Pages**. Everything on the site is referenced by
relative path, so it works at a domain root and under `/LearneQuant/` alike —
but the absolute URLs in the social tags and sitemap would need updating to
match.

## What is in here

```
index.html                 the course: 5.6 MB of pre-rendered content
                           plus the inlined stylesheets
assets/css/                the editable source for those stylesheets
  01-core.css              type, colour, layout
  02-layers.css            iOS/safe-area, lesson units, refinements
  03-route.css             the course view
  04-touch.css             phone-only fixes, all behind (pointer: coarse)
assets/js/                 the runtime, split by what it does
  00-trainer-loader.js     defers the practice engine off the critical path
  10-dialog.js             the ask-and-tell dialog layer
  20-search-index.js       the search index
  21-reference.js          reference runtime
  22-reference-data.js     glossary and retrieval cards
  23-reference-ui.js       study system, calculators, The Forge
  30-spine.js              the 368-lesson spine
  31-route-data.js         route data
  32-course.js             the ordered course
  33-lessons.js            lesson layer
  40-interface.js          route interface, lessons, iOS fixes, downloads
  05-scroll-a11y.js        makes sideways-scrolling regions keyboard-usable
  90-trainer.js            the practice engine — loaded on demand
tools/inline-css.py        pushes assets/css into index.html
setup.ps1 / setup.sh       one-time: writes the workflow, inits the repo
LICENSE                    MIT, for the code
LICENSE-CONTENT.md         CC BY 4.0, for the course material
sw.js                      service worker: instant repeat visits, full offline
manifest.webmanifest       installable as an app
404.html                   for links that were never going to resolve
.nojekyll                  keep Jekyll's hands off the build
```

### How it was assembled

The source was a single 8.9 MB HTML file with everything inlined. Splitting it
was mechanical and lossless: the ten `<style>` blocks and eighty-one `<script>`
blocks were lifted out **verbatim**, in document order, into the files above,
and the document kept every byte of its markup. The extraction asserts that
each block is used exactly once and that the order never inverts.

Four scripts stayed inline because they have to run before anything else
paints: the box-sizing reset, the sidebar-state guard, the event-ownership
shim, and the boot-splash remover.

---

## The performance work

The original loaded everything before it did anything.

Measured in headless Chromium against a gzip-serving origin — what GitHub
Pages does — throttled to 1.6 Mbps with 150 ms of latency:

| | before | after | |
|---|---:|---:|---:|
| First contentful paint | 460 ms | **360 ms** | −22% |
| DOMContentLoaded | 11.3 s | **8.7 s** | −23% |
| Transferred | 2,199 KB | **1,696 KB** | −23% |
| Blocking scripts | 81 inline | **0** | |
| Second visit | full download | **670 ms**, from disk | |
| With no connection | impossible | **1.5 s**, all 368 lessons | |

The rendered result is unchanged: a pixel diff of all three views, at desktop
and phone widths, comes back at zero differing pixels out of 1,296,000.

**Nothing blocks the parser.** Every script is now `defer`, so the 5.4 MB of
pre-rendered course markup streams and paints while the JavaScript downloads
alongside it.

**The stylesheets are inlined, on purpose.** Linking them was tried and
measured: it costs a render-blocking round trip and pushed first paint out to
648 ms. Inlining them beats even the original file, because the two
stylesheets that used to sit at the end of the body now arrive before the
first paint instead of restyling after it. `assets/css/` stays the editable
source and `tools/inline-css.py` puts it into `index.html`; CI fails the
build if the two have drifted apart.

**The practice engine loads when you reach for it.** `90-trainer.js` is
1.6 MB — more than everything else put together, and not needed to read a
lesson. `00-trainer-loader.js` installs a stand-in for `window.__TRAINER__`
and fetches the real engine on the first pointer or key event, the moment the
trainer view opens, or at idle if neither happens. The stand-in is installed
as a property accessor, so the course layer — which captures the trainer once
at boot and keeps that reference — never notices the swap.

**Caching and offline.** The service worker precaches the shell on install
and the engine just after, then answers navigations network-first (a deploy
shows up on the next visit) and assets stale-while-revalidate (instant, and
still correct when served from a branch with no build step).

GitHub Pages gzips everything on the way out, which takes the whole site from
8.9 MB to roughly 2.2 MB on the wire.

---

## On phones

The document arrived with a good deal of phone work already in it — safe-area
insets on the floating chrome, 16px form fields so iOS does not zoom when one
takes focus, `:hover` styling neutralised under `(hover: none)`,
`content-visibility` with measured intrinsic sizes on all 53 volumes and 368
lessons. An audit across eight device profiles, 320 px to 768 px, portrait and
landscape, found three things it had missed.

**212 tables, 89 of them wider than the screen.** Some reached 1002 px on a
393 px phone. Because the page itself does not scroll sideways, those columns
were not awkward — they were *unreachable*: clipped, with no gesture that
brought them back. Each table is now its own horizontal scroll container. That
is done in CSS rather than by wrapping them in JavaScript, because wrapping 212
tables would force every one into layout and undo the `content-visibility`
work. All 89 are now readable; none still clips.

**Touch targets that were tall but not wide.** The existing rules set
`min-height: 44px` and no `min-width`, so the contents button and the theme
toggle came out 44 px tall and 27 px across — and width is the axis a thumb
actually misses. Those, the trainer's digit buttons and the route chips now
meet 44×44 everywhere. Where a control is deliberately small — the section
checks, the `¶` heading anchors — the *hit area* grew instead, through a
pseudo-element that paints nothing, so nothing moved on screen.

**Tap latency and stray gestures.** `touch-action: manipulation` on controls
drops the double-tap-to-zoom wait, while leaving pinch-zoom working on the page
itself. Tables, code blocks and the sidebar contain their own overscroll, so
swiping to the end of one no longer hands the gesture to the page behind it or
triggers pull-to-refresh mid-lesson.

One measurement worth keeping: a 44 px-wide hit target centred on an inline `¶`
overhangs the right margin and pushed the whole document 2 px wider than the
screen — a real horizontal wobble, found by diffing `scrollWidth` against the
viewport. Height is free where width is not, so those anchors are 32×44. Every
device profile now reports `scrollWidth === clientWidth` in all three views.

**Scrollable regions are reachable from a keyboard, and say that they scroll.**
Making 283 regions scroll solved reading them with a thumb and did nothing for
anyone using a keyboard: none was focusable, so the hidden columns stayed
hidden (WCAG 2.1.1). `assets/js/05-scroll-a11y.js` gives each one `tabindex`
and a name once it is actually wider than its box — lazily, through an
`IntersectionObserver`, so it never forces the `content-visibility` content
into layout. Measured: every region is marked by the time a reader reaches it,
234 of 234, none missed. The same marking drives an inset edge shadow that
fades once you reach the far side, which is the affordance the first pass
lacked.

An audit of the touch layer against the live DOM — every selector, in all
three views and several deeper states — found two rules that had been matching
nothing: the panels are `.qc-panel`, not `.panel`, and the reference search
field sits in `.sb-search`, not `.search`. Both are fixed; three selectors that
can never match anything in this document were removed.

The touch rules live in `assets/css/04-touch.css` inside
`@media (pointer: coarse)`; the scroll cue sits outside it, because a narrow
desktop window clips a table exactly the same way. The desktop pixel diff is
still zero — at full width nothing overflows, so no cue is drawn.

---

## Working on it locally

A service worker needs a real origin, so serve rather than double-click:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/
```

Editing JavaScript is direct — the files in `assets/js/` are the files that
ship. **Stylesheets are the one exception**: edit `assets/css/*.css`, then run

```bash
python3 tools/inline-css.py
```

to push the change into `index.html`, and commit both. `--check` reports
whether they are in sync without writing anything; CI runs exactly that and
refuses to deploy if they have drifted.

If you change anything while a service worker is registered, hard-reload once
(<kbd>Shift</kbd> + reload) or tick *Update on reload* in the browser's
Application panel.

---

## Source material

This repository deliberately does **not** contain `24 Quant Books.md`, the
27 MB of extracted textbook text the course was written against. Those books
— Hull, López de Prado, Hilpisch and the rest — are in copyright, and
republishing their body text is not something a public repository can do.
`.gitignore` excludes the file so it cannot be committed by accident. It is
still on disk next to this folder; it just never travels.

---

## Without JavaScript, and when a script fails

All three views are `display: none` until a script adds a class, so with
scripting off the page used to be a permanent loading splash — 85 characters
of visible text sitting on top of 5.4 MB of downloaded, readable content. The
document's own `<noscript>` already promised *"all fifty-two volumes, the
equations, the code — works without it"*; a `<noscript>` stylesheet now makes
that true. The reference renders in full: 884,603 px of it, with its sidebar
of 52 volume links working as ordinary anchors. Searching and the study
features need a script and are hidden.

`<noscript>` does nothing when scripting is *on* and a file simply fails to
arrive — a flaky network, a half-finished deploy. The boot splash clears
itself after nine seconds either way, which turned that case into a blank
page. A small inline failsafe now checks twice, at 12 and 20 seconds, and
shows the reference if no view ever became visible. It adds the same class the
app itself uses and sets no inline style, so a slow device that finishes
booting afterwards takes the reference back down on its own rather than
leaving two views stacked. It never runs while `__QC_MODE__` is set, which is
how it stays out of a healthy page's way.

---

## The iOS crash, and what actually costs memory

Safari on an iPhone 14 Pro reported *"A problem repeatedly occurred"* after
tapping **Start — lesson 1**. That message means the WebContent process was
killed, reloaded, and killed again.

Measured in WebKitGTK 2.52 — the same engine — by reading the WebProcess RSS
from outside the browser:

| build | after load | showing the reference |
|---|---:|---:|
| the original single-file document | 500 MB | **732 MB** |
| this repository, at the time of the crash | 515 MB | 739 MB |
| this repository now | 502 MB | **729 MB** |

The cost is the document itself and predates any of the work here. Of its
102,000 elements, **54% are typeset mathematics**: 2,830 `<svg>`, 24,544 `<g>`
and **23,308 `<use>`**, and WebKit instantiates a shadow tree for every `<use>`.
`content-visibility` is doing its job — turning it off costs another 80 MB —
but it cannot reduce the node count, only the layout work.

Two things were changed in response, neither of which is a cure:

**The practice engine no longer loads on the first touch.** It used to be
fetched on the first `pointerdown` anywhere, which fired 1.6 MB of generators
into the parser at the exact moment the reader tapped Start. It now loads when
the trainer is actually opened, or at idle.

**A crash no longer makes the site unopenable.** The app saves its current
screen, so a crash while reading a lesson was restored on reload and crashed
again — which is what turns one failure into "repeatedly occurred". A guard in
the head marks a load as in flight and clears the mark once the page settles;
finding the mark still set twice in a row means two loads died, and the saved
screen is put back to the map. Progress, cards and trainer history are never
touched. One crash is tolerated, because one crash can have any cause.

### The durable fix

Neither of those reduces the 729 MB. Getting a comfortable margin on a phone
means shrinking the document, and there are only really three ways:

1. **Split the reference into a page per volume.** The largest win by far, and
   the largest change: in-document search and the 24,673 in-page links would
   need rethinking.
2. **Load the mathematics on demand.** The maths is 54% of the DOM; rendering
   it per section as the reader arrives would cut the resident node count
   enormously without touching the prose.
3. **Replace `<use>` with plain paths in the common glyphs.** Fewer shadow
   trees at the cost of a larger file — worth measuring before committing to.

---

## Browser support

Tested in two engines: Chromium 141, and WebKitGTK 2.52 — the same WebCore and
JavaScriptCore that Safari is built on. Both render the same structure: 53
volumes, 368 lessons, 212 tables, 1,421 CSS rules, no horizontal overflow.
What differs between them is font metrics, not layout.

Full fidelity needs roughly **Safari 16 / iOS 16, Chrome 105, Firefox 121**.
Below that the page still works and degrades a feature at a time:

| feature | needs | without it |
|---|---|---|
| `content-visibility` | Safari 18, Chrome 85 | renders all 5.4 MB at once — slower, not broken |
| `:has()` | Safari 15.4, Chrome 105 | one Forge control loses its grid span |
| `dvh` / `svh` | Safari 15.4, Chrome 108 | falls back to `vh` |
| `overscroll-behavior` | Safari 16, Chrome 63 | a scroll can chain to the page |
| `IntersectionObserver` | Safari 12.1 | scroll cues are skipped; the CSS still scrolls |

`requestIdleCallback` does not exist in WebKit at all. All three call sites —
two in the original document, one in the trainer loader — fall back to
`setTimeout`, and the practice engine was confirmed loading in WebKit with all
245 generators present.

---

## Licence

Open for public use, under two licences that split along the obvious seam.

| | licence | |
|---|---|---|
| **Code** — `assets/js/`, `sw.js`, `tools/` | [MIT](LICENSE) | use, modify, sell, no strings beyond keeping the notice |
| **Course material** — the 368 lessons, the reference text, the data banks, the design | [CC BY 4.0](LICENSE-CONTENT.md) | share and adapt, commercially too, as long as you credit it |

Where one file holds both — `index.html` and the trainer banks do — the prose
is CC BY 4.0 and the program logic is MIT, and a reuser may rely on whichever
fits what they are taking.

Credit looks like this:

> *The Quant Curriculum* by Claudia, licensed under
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> Source: `https://github.com/YOUR-USERNAME/LearneQuant`

The page declares it in machine-readable form too, through
`<link rel="license">` and the `license` field of its `schema.org` `Course`
block, so a crawler or a reuse tool can pick it up without reading this file.

Two small things worth doing before you push: put your own name or GitHub
handle in place of *Claudia* in `LICENSE` and `LICENSE-CONTENT.md`, and fill in
the real repository URL in the attribution examples.

Neither licence reaches the textbooks the course was written against — see
*Source material* above. Nothing here grants any right in them.

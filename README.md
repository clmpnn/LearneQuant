# LearneQuant

**The Quant Curriculum** — 368 ordered lessons across 53 stages, a complete
reference, and a practice engine of over a thousand generated problems. Every
lesson is open from the start; the order is a recommendation, not a gate.

It is a static site with no build step, no framework and no dependencies. Open
`index.html` and it runs.

---

## Publishing it

**First, run the setup script once.** Right-click `setup.ps1` and choose *Run
with PowerShell* (or `bash setup.sh` from Git Bash). It writes
`.github/workflows/deploy.yml`, initialises the git repository and makes the
first commit. Those two things had to be left to a script: the tool that wrote
this folder is not allowed to create a `.git` directory or a GitHub Actions
workflow, which is the right rule to have. Running it twice is harmless.

Then:

1. Create an empty repository on GitHub called `LearneQuant`.
2. From this folder:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/LearneQuant.git
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.

That is all. The workflow in `.github/workflows/deploy.yml` takes over from
there and the site appears at
`https://YOUR-USERNAME.github.io/LearneQuant/` within a couple of minutes.

The workflow stamps the real public URL into the social tags, sitemap and
`robots.txt` at deploy time, so nothing here has a hostname hard-coded into
it. It also refuses to publish if `.nojekyll` has gone missing, if any
JavaScript file fails to parse, or if `index.html` points at an asset that
is not in the repository.

### A custom domain

Put the bare hostname in a file called `CNAME` at the root
(`quant.example.com`, one line, no protocol), push, and set the same domain
under **Settings → Pages**. Everything on the site is referenced by relative
path, so it works at a domain root and under `/LearneQuant/` without changes.

### Deploying from a branch instead

If you switch **Source** to *Deploy from a branch*, the site still works —
that is why `.nojekyll` is committed and why the service worker revalidates
in the background rather than trusting a build id. You lose the pre-publish
checks and the URL stamping; the social preview tags will read
`__SITE_URL__` until the workflow runs.

---

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

The whole layer lives in `assets/css/04-touch.css`, entirely inside
`@media (pointer: coarse)`. A mouse-driven browser matches none of it, and the
desktop pixel diff is still zero.

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

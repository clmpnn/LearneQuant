#!/usr/bin/env bash
# LearneQuant — one-time setup. Restores the unmarked images, and creates
# .github/workflows/deploy.yml and the git repository, none of which could be
# written here remotely.
# Safe to run more than once.
set -euo pipefail
cd "$(dirname "$0")"

# --- restore the unmarked icons -------------------------------------------
# The bridge that copied this folder over injects C2PA Content Credentials into
# every PNG and SVG it writes. The originals travelled inside a zip, which it
# leaves alone; put them back.
if [ -f icons-original.zip ]; then
  if command -v unzip >/dev/null 2>&1; then
    unzip -o -q icons-original.zip && rm -f icons-original.zip
    echo "  restored the unmarked images and removed the zip"
  else
    echo "  unzip is not installed — extract icons-original.zip by hand, then re-run"
  fi
else
  echo "  no icons-original.zip here — leaving the images as they are"
fi

mkdir -p .github/workflows
cat > .github/workflows/deploy.yml <<'WORKFLOW_EOF'
# ---------------------------------------------------------------------------
# Build and publish the curriculum to GitHub Pages.
#
# There is no bundler and nothing to compile: the site in this repository is
# the site that gets served. The build job only stamps two values that cannot
# be known until deploy time — the public URL and a cache-busting build id —
# and then refuses to publish if anything obvious is wrong.
# ---------------------------------------------------------------------------
name: Deploy to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Let a running deploy finish rather than cancelling it half way.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Stamp the site URL and the build id
        env:
          BASE: ${{ steps.pages.outputs.base_url }}
          SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          SITE="${BASE%/}/"
          echo "site url: $SITE"
          for f in index.html 404.html robots.txt sitemap.xml; do
            [ -f "$f" ] && sed -i "s|__SITE_URL__|${SITE}|g" "$f" || true
          done
          sed -i "s|__BUILD_ID__|${SHA:0:12}|g" sw.js

      - name: Check the site before publishing it
        run: |
          set -euo pipefail
          test -f .nojekyll        || { echo "::error::.nojekyll is missing — Jekyll will eat the build"; exit 1; }
          test -f index.html       || { echo "::error::no index.html"; exit 1; }
          test -f sw.js            || { echo "::error::no service worker"; exit 1; }
          ! grep -q "__SITE_URL__" index.html 404.html robots.txt sitemap.xml \
            || { echo "::error::site URL placeholder was not substituted"; exit 1; }
          ! grep -q "__BUILD_ID__" sw.js \
            || { echo "::error::build id placeholder was not substituted"; exit 1; }
          for f in sw.js assets/js/*.js tools/*.py; do
            case "$f" in
              *.js) node --check "$f"    || { echo "::error::$f does not parse"; exit 1; } ;;
              *.py) python3 -m py_compile "$f" || { echo "::error::$f does not parse"; exit 1; } ;;
            esac
          done
          python3 tools/inline-css.py --check \
            || { echo "::error::assets/css has changed but index.html was not regenerated — run tools/inline-css.py and commit"; exit 1; }
          python3 - <<'PY'
          import json, sys, pathlib, re
          json.load(open("manifest.webmanifest"))
          html = pathlib.Path("index.html").read_text(encoding="utf-8")
          for m in re.finditer(r'(?:src|href)="(assets/[^"]+)"', html):
              if not pathlib.Path(m.group(1)).is_file():
                  sys.exit("missing asset referenced by index.html: " + m.group(1))
          print("manifest parses; every referenced asset exists")
          PY
          echo "total size: $(du -sh --exclude=.git . | cut -f1)"

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
WORKFLOW_EOF
echo "  wrote .github/workflows/deploy.yml"

if [ -d .git ]; then
  echo "  a git repository already exists here — leaving it alone"
else
  git init -b main >/dev/null
  git add -A
  git commit -q -m "The Quant Curriculum as a static site for GitHub Pages" \
    -m "The single 8.9 MB build, split into a repository GitHub Pages can serve well, without changing a pixel of what the reader sees. Every script is deferred, the stylesheets are inlined, and the 1.6 MB practice engine loads only when the reader reaches for it. 24 Quant Books.md is deliberately absent and gitignored."
  echo "  initialised a git repository and committed $(git ls-files | wc -l | tr -d ' ') files"
fi

cat <<'NEXT'

Next
----
  1. Create an empty repository on GitHub named LearneQuant.
  2. git remote add origin https://github.com/YOUR-USERNAME/LearneQuant.git
     git push -u origin main
  3. On GitHub: Settings -> Pages -> Source -> GitHub Actions.

NEXT

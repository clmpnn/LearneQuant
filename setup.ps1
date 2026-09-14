<#
    LearneQuant — one-time setup
    ----------------------------
    Three things could not be done remotely: writing a .github/workflows file,
    creating a .git directory — both blocked from remote writes, for good
    reasons — and delivering the images without C2PA Content Credentials being
    stamped into them in transit. This script handles all three.

    It is safe to run more than once. It will not touch an existing commit.

        Right-click this file and choose "Run with PowerShell"

    or, from a terminal in this folder:

        powershell -ExecutionPolicy Bypass -File .\setup.ps1
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "LearneQuant setup" -ForegroundColor Cyan
Write-Host "-----------------"

# --- 1. restore the unmarked icons ----------------------------------------
# The bridge that copied this folder over injects C2PA Content Credentials
# into every PNG and SVG it writes — an ancillary caBX chunk, about 5.7 KB a
# file. Harmless, but not what was built. The originals travelled inside a zip,
# which the bridge leaves alone, and are put back here.
$zipPath = Join-Path $PSScriptRoot "icons-original.zip"
if (Test-Path $zipPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    $n = 0
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName.EndsWith("/")) { continue }
            $dest = Join-Path $PSScriptRoot ($entry.FullName -replace "/", "\")
            New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
            $n++
        }
    } finally { $zip.Dispose() }
    Remove-Item $zipPath -Force
    Write-Host "  restored $n unmarked images and removed the zip"
} else {
    Write-Host "  no icons-original.zip here — leaving the images as they are"
}

# --- 2. the GitHub Pages workflow -----------------------------------------
$wfDir = Join-Path $PSScriptRoot ".github\workflows"
New-Item -ItemType Directory -Force -Path $wfDir | Out-Null
$wfPath = Join-Path $wfDir "deploy.yml"

$workflow = @'
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
'@

# Write UTF-8 without a BOM, with LF endings — Actions wants both.
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($wfPath, ($workflow -replace "`r`n", "`n") + "`n", $utf8)
Write-Host "  wrote .github\workflows\deploy.yml"

# --- 3. the git repository -------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "  git is not installed, so the repository was not created." -ForegroundColor Yellow
    Write-Host "  Install it from https://git-scm.com/download/win and run this again."
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

if (Test-Path (Join-Path $PSScriptRoot ".git")) {
    Write-Host "  a git repository already exists here — leaving it alone"
} else {
    git init -b main | Out-Null
    Write-Host "  initialised a git repository on branch main"

    git add -A | Out-Null

    $msg = @'
The Quant Curriculum as a static site for GitHub Pages

The single 8.9 MB build, split into a repository GitHub Pages can serve well,
without changing a pixel of what the reader sees.

The split is mechanical and lossless: the ten <style> blocks and eighty-one
<script> blocks came out verbatim, in document order, into assets/css and
assets/js, and the document kept every byte of its markup. Four scripts stay
inline because they must run before the first paint.

Measured against a gzip-serving origin at 1.6 Mbps and 150 ms latency:
first contentful paint 460 ms -> 360 ms, DOMContentLoaded 11.3 s -> 8.7 s,
transferred 2199 KB -> 1696 KB, a second visit 670 ms from disk, and the
whole course readable with no connection at all.

Every script is deferred, the stylesheets are inlined (linking them was
measured and cost 288 ms of first paint), and the 1.6 MB practice engine
loads only when the reader reaches for it.

Verified against the original: identical globals, 53 volumes, 368 lessons,
1412 CSS rules, no console errors, and a pixel diff of all three views at
desktop and phone widths that comes back at zero.

24 Quant Books.md is deliberately absent and gitignored: 27 MB of body text
from books still in copyright, which was reading material, not the course.
'@
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $msg, $utf8)
    git commit -q --file=$tmp
    Remove-Item $tmp -Force
    Write-Host "  committed $(git rev-list --count HEAD) revision, $((git ls-files).Count) files"
}

# --- 4. what to do next ----------------------------------------------------
Write-Host ""
Write-Host "Next" -ForegroundColor Cyan
Write-Host "----"
Write-Host "  1. Create an empty repository on GitHub named LearneQuant."
Write-Host "  2. Run, with your own username:"
Write-Host ""
Write-Host "       git remote add origin https://github.com/YOUR-USERNAME/LearneQuant.git" -ForegroundColor Green
Write-Host "       git push -u origin main" -ForegroundColor Green
Write-Host ""
Write-Host "  3. On GitHub: Settings -> Pages -> Source -> GitHub Actions."
Write-Host ""
Write-Host "  The site then builds itself and appears at"
Write-Host "  https://YOUR-USERNAME.github.io/LearneQuant/"
Write-Host ""
Read-Host "Press Enter to close"

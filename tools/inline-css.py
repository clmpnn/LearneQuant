#!/usr/bin/env python3
"""
Put assets/css into index.html, or check that it is already there.

The stylesheets are render-blocking: linking them costs a round trip before
anything paints, which measured ~290 ms on a throttled connection. So they
ship inlined. The files under assets/css remain the editable source — edit
those, run this, commit both.

    python3 tools/inline-css.py            rewrite index.html
    python3 tools/inline-css.py --check    exit 1 if index.html is out of date

No dependencies and no build system. Python 3.8 or newer.
"""
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ["assets/css/01-core.css", "assets/css/02-layers.css", "assets/css/03-route.css",
       "assets/css/04-touch.css"]
BEGIN = "<!-- css:begin — generated from assets/css by tools/inline-css.py; do not edit here -->"
END = "<!-- css:end -->"


def block() -> str:
    out = [BEGIN]
    for c in CSS:
        text = (ROOT / c).read_text(encoding="utf-8").rstrip()
        out.append('\n<style data-src="%s">\n%s\n</style>' % (c, text))
    out.append("\n" + END)
    return "".join(out)


def main() -> int:
    check = "--check" in sys.argv
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")

    i, j = html.find(BEGIN), html.find(END)
    if i < 0 or j < 0:
        print("index.html has no css:begin/css:end markers", file=sys.stderr)
        return 2

    current = html[i:j + len(END)]
    fresh = block()

    if current == fresh:
        print("index.html is in sync with assets/css")
        return 0
    if check:
        print("index.html is OUT OF DATE — run: python3 tools/inline-css.py",
              file=sys.stderr)
        return 1

    path.write_text(html[:i] + fresh + html[j + len(END):],
                    encoding="utf-8", newline="\n")
    print("index.html updated from %d stylesheets" % len(CSS))
    return 0


if __name__ == "__main__":
    sys.exit(main())

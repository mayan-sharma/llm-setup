#!/bin/sh
# Regenerates the Horizon sky and the turning disc (needs Google Chrome, node, ImageMagick, img2webp).
#   export.sh <n>   writes sky-<n>.jpg and disc-<n>.webp
# Herdr caches images by path: after a change, use a new number here, in layouts/horizon.json
# (the sky) and in main.js (DISC).
N="${1:-2}"
cd "$(dirname "$0")" || exit 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --allow-file-access-from-files --virtual-time-budget=120000 --dump-dom "file://$PWD/make.html" 2>/dev/null > .dump.html
python3 - "sky-$N.jpg" <<'PY'
import base64, html, re, sys
dom = open(".dump.html").read()
body = html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1))
open(sys.argv[1], "wb").write(base64.b64decode(body.strip().split("|", 1)[1].split(",", 1)[1]))
print(sys.argv[1])
PY
rm -f .dump.html
TMP=$(mktemp -d) && node frames.mjs "$TMP" 120 528 && \
  for f in "$TMP"/*.rgba; do magick -size 528x528 -depth 8 "rgba:$f" "${f%.rgba}.png"; done && \
  img2webp -loop 0 -d 83 -lossy -q 88 -m 6 "$TMP"/*.png -o "disc-$N.webp" >/dev/null && echo "disc-$N.webp"
rm -rf "$TMP"

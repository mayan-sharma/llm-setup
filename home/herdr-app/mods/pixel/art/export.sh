#!/bin/sh
# Repaints the Pixel layout's art (needs node and ImageMagick).
#   export.sh <n>   writes sky-<n>.png and camp-<n>.png
# Herdr caches images by path: after a change use a new number here, in
# layouts/pixel.json (the sky) and in main.js (CAMP).
N="${1:-1}"
cd "$(dirname "$0")" || exit 1
TMP=$(mktemp -d)
node make.mjs "$TMP" | while read -r name w h; do
  case "$name" in sky) s=600 ;; *) s=800 ;; esac
  magick -size "${w}x${h}" -depth 8 "rgba:$TMP/$name.rgba" -filter point -resize "$s%" -strip "$name-$N.png" && echo "$name-$N.png"
done
rm -rf "$TMP"

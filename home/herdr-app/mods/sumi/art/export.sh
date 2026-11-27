#!/bin/sh
# Regenerates the Sumi layout's images from make.html (needs Google Chrome).
cd "$(dirname "$0")" || exit 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=120000 --dump-dom "file://$PWD/make.html" 2>/dev/null > .dump.html
python3 - <<'PY'
import base64, html, re
dom = open(".dump.html").read()
body = html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1))
for line in body.strip().split("\n"):
    name, url = line.split("|", 1)
    open(name, "wb").write(base64.b64decode(url.split(",", 1)[1]))
    print(name)
# The marks the mod tints and spins: the PNG wrapped in an SVG, used as a mask.
for stem in ["work-a", "work-b", "done", "idle-a", "idle-b"]:
    data = base64.b64encode(open(stem + ".png", "rb").read()).decode()
    open(stem + ".svg", "w").write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="90" height="90" viewBox="0 0 90 90"><image width="90" height="90" href="data:image/png;base64,%s" xlink:href="data:image/png;base64,%s"/></svg>\n' % (data, data))
PY
rm -f .dump.html

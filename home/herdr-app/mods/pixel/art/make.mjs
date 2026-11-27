// Paints the Pixel layout's art as raw RGBA; export.sh turns it into PNGs.
//   node make.mjs <out dir>
// sky   504x317 art px: a dithered dusk, stars, two far ridges (the layout background)
// camp  91x66 art px: the rail's foot. Moon, pines, a tent, the herder and two sheep
//       by the fire. The flames themselves are drawn live by main.js at FIRE.
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? ".";
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  const set = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    px.set(typeof c === "string" ? hex(c) : c, (y * w + x) * 4);
  };
  const rect = (x, y, rw, rh, c) => {
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, c);
  };
  // rows of characters; `key` maps a character to a colour, anything else is skipped
  const stamp = (x, y, rows, key) => rows.forEach((row, j) => [...row].forEach((ch, i) => key[ch] && set(x + i, y + j, key[ch])));
  const save = (name) => {
    writeFileSync(`${out}/${name}.rgba`, px);
    console.log(`${name} ${w} ${h}`);
  };
  return { w, h, set, rect, stamp, save };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---- sky --------------------------------------------------------------------

{
  const W = 504, H = 317;
  const c = canvas(W, H);
  const ramp = ["#0d0e18", "#11121e", "#151726", "#1a1c2c", "#1f2238", "#252947", "#2c2d56", "#382c5e", "#482b60", "#5d275d"];
  for (let y = 0; y < H; y++) {
    const t = Math.pow(y / (H - 1), 2.1) * (ramp.length - 1);
    for (let x = 0; x < W; x++) {
      const i = Math.min(ramp.length - 1, Math.floor(t + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16));
      c.set(x, y, ramp[i]);
    }
  }
  const r = rng(7);
  const tones = ["#333c57", "#566c86", "#566c86", "#94b0c2", "#94b0c2", "#f4f4f4"];
  for (let i = 0; i < 330; i++) {
    const x = Math.floor(r() * W), y = Math.floor(Math.pow(r(), 1.25) * H * 0.84);
    // the rail's list sits over the top left: only faint stars there, or they read as punctuation
    const quiet = x < 98 && y < 222;
    if (quiet && i % 3) continue;
    c.set(x, y, quiet ? "#252947" : tones[Math.floor(r() * tones.length)]);
  }
  for (let i = 0; i < 16; i++) {
    const x = 4 + Math.floor(r() * (W - 8)), y = 4 + Math.floor(r() * H * 0.62);
    if (x < 100 && y < 224) continue;
    c.set(x, y, "#f4f4f4");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, i % 4 === 0 ? "#73eff7" : "#94b0c2");
  }
  const ridge = (base, amp, colour, edge, seed) => {
    const q = rng(seed);
    const a = q() * 6, b = q() * 6, d = q() * 6;
    let step = 0;
    for (let x = 0; x < W; x++) {
      if (x % 3 === 0) step = Math.round((q() - 0.5) * 3);
      const top = Math.round(base - amp * (0.55 * Math.sin(x / 47 + a) + 0.3 * Math.sin(x / 19 + b) + 0.15 * Math.sin(x / 7 + d)) + step);
      for (let y = top; y < H; y++) c.set(x, y, y === top ? edge : colour);
    }
  };
  ridge(H - 34, 20, "#2a2350", "#3a2c62", 3);
  ridge(H - 15, 11, "#141523", "#1f2238", 11);
  c.save("sky");
}

// ---- camp -------------------------------------------------------------------

{
  const W = 91, H = 66;
  const c = canvas(W, H);
  const INK = "#0b0c15", EDGE = "#191b2b";
  const FIRE = 59;
  const ground = (x) => 40 - Math.round(2 * Math.sin((x - 10) / 26));

  // moon
  const mx = 75, my = 11, mr = 7;
  for (let y = -mr; y <= mr; y++)
    for (let x = -mr; x <= mr; x++) {
      if (x * x + y * y > mr * mr + 2) continue;
      const shade = (x - 4) * (x - 4) + (y + 3) * (y + 3) > 84;
      c.set(mx + x, my + y, shade ? "#94b0c2" : "#f4f4f4");
    }
  for (const [x, y] of [[-3, -2], [-2, -2], [-3, -1], [1, 2], [2, 2], [-1, 4], [3, -3]]) c.set(mx + x, my + y, "#94b0c2");

  // pines: silhouettes, with a little firelight on the side that faces it
  const pine = (cx, height, lit) => {
    const gy = ground(cx);
    c.rect(cx, gy - 2, 1, 2, INK);
    for (let r = 0; r < height; r++) {
      const hw = Math.floor(Math.floor(r / 4) * 1.25) + (r % 4);
      const y = gy - 2 - height + r;
      c.rect(cx - hw, y, hw * 2 + 1, 1, INK);
      if (lit && hw > 0 && r % 2 === 1) c.set(cx + (lit > 0 ? hw : -hw), y, "#3a2c62");
    }
  };
  pine(7, 27, 1);
  pine(17, 18, 1);
  pine(86, 16, -1);

  // ground, lit from the fire
  for (let x = 0; x < W; x++) {
    const g = ground(x);
    for (let y = g; y < H; y++) c.set(x, y, y === g ? EDGE : INK);
    const d = Math.abs(x - FIRE);
    if (d <= 3) c.set(x, g, "#ef7d57");
    else if (d <= 7) c.set(x, g, "#b13e53");
    else if (d <= 13) c.set(x, g, d % 2 ? "#5d275d" : "#3a2c62");
    if (d <= 5 && (x + g) % 2 === 0) c.set(x, g + 1, "#5d275d");
  }

  // tent
  {
    const tx = 35, base = ground(35) - 1;
    for (let r = 0; r < 10; r++) {
      const hw = Math.ceil(r * 0.9);
      const y = base - 9 + r;
      for (let x = -hw; x <= hw; x++) c.set(tx + x, y, x < 0 ? "#252947" : "#482b60");
      c.set(tx + hw, y, "#b13e53");
      c.set(tx - hw, y, "#333c57");
      if (r >= 4) c.set(tx, y, INK);
      if (r >= 7) c.rect(tx - 1, y, 3, 1, INK);
    }
    c.set(tx, base - 10, "#566c86");
  }

  // the herder, sitting by the fire with a crook
  c.stamp(47, ground(51) - 10, [".ss......", "s..s.....", "s...hhh..", "s..hhhhh.", "s...ff...", "s..cccc..", "s..cccco.", "s.ccccco.", "s.cccccck", "s.kkkkkkk"], {
    s: "#566c86", h: "#94b0c2", f: "#ffcd75", c: "#3b5dc9", o: "#ef7d57", k: "#29366f",
  });

  // two sheep
  const sheep = [".wwww...", "wwwwwwhh", "wwwwwwhh", "wwwwww..", ".k..k..."];
  c.stamp(66, ground(69) - 5, sheep.map((r) => [...r].reverse().join("")), { w: "#f4f4f4", h: "#94b0c2", k: "#566c86" });
  c.stamp(22, ground(26) - 5, sheep, { w: "#94b0c2", h: "#566c86", k: "#333c57" });

  // logs
  c.stamp(FIRE - 3, ground(FIRE) - 1, ["b.....b", ".bbbbb."], { b: "#482b60" });

  c.save("camp");
}

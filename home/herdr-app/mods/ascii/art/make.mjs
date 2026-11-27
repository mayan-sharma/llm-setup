// Draws the aquarium at the rail's foot as text frames and writes ../scenes.js.
//   node make.mjs [frame]     (with a frame number: also prints that frame)
// The scene is { cols, rows, ms, layers }: a layer is one colour (a name from the
// mod's palette) and a list of frames (strings with newlines) holding only that
// colour's characters. The mod stacks the layers; Herdr steps every .frames()
// element on one clock, so they stay together. Every motion's period divides N,
// so the last frame meets the first.
import { writeFileSync } from "node:fs";

const COLS = 34, ROWS = 15, N = 136, MS = 150;

// Fish swim one way and come round again: `span` columns to a lap, `step` columns
// a frame, so N * step must be a whole number of laps.
const FISH = [
  { art: ["><(((o>"], row: 2, step: 0.5, span: 68, at: 4, colour: "yellow" },
  { art: ["<o)))><"], row: 6, step: -0.5, span: 68, at: 30, colour: "cyan" },
  { art: ["><>"], row: 4, step: 1, span: 68, at: 40, colour: "bone" },
  { art: ["><>"], row: 3, step: 1, span: 68, at: 46, colour: "bone" },
  { art: ["><>"], row: 5, step: 1, span: 68, at: 48, colour: "bone" },
  { art: ["  ,--,", "<'    )=<", "  `--'"], row: 8, step: -0.5, span: 68, at: 52, colour: "red" },
  { art: ["<><"], row: 11, step: -0.5, span: 68, at: 12, colour: "green" },
  { art: [">=>"], row: 12, step: 0.5, span: 68, at: 50, colour: "mid" },
];
// Weeds: column of the root, height, which way they lean first.
const WEEDS = [[3, 5, 0], [5, 3, 1], [24, 4, 0], [26, 6, 1], [31, 3, 0]];
// Bubbles: column, the frame they leave the sand.
const BUBBLES = [[9, 0], [10, 9], [27, 17], [19, 25]];
const SAND = "..,._.,..__.,.__/^^\\_.,..,._.,.._.";

function frame(f) {
  const ch = Array.from({ length: ROWS }, () => new Array(COLS).fill(" "));
  const co = Array.from({ length: ROWS }, () => new Array(COLS).fill(""));
  const put = (x, y, c, colour) => {
    if (c === " " || x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    ch[y][x] = c;
    co[y][x] = colour;
  };
  // the surface, drifting left
  const wave = "~~^~";
  for (let x = 0; x < COLS; x++) put(x, 0, wave[(x + Math.floor(f / 2)) % 4], "blue");
  // the sand
  for (let x = 0; x < COLS; x++) put(x, ROWS - 1, SAND[x], "dim");
  // weeds sway: each joint leans one way, then the other
  for (const [x, h, lean] of WEEDS)
    for (let i = 0; i < h; i++) {
      const s = (Math.floor(f / 4) + i + lean) % 2;
      put(x + s, ROWS - 2 - i, s ? "(" : ")", "green");
    }
  // bubbles rise a row every two frames and grow, then the column rests
  for (const [x, start] of BUBBLES) {
    const k = Math.floor((((f - start) % 34) + 34) % 34 / 2); // 0..16
    const y = ROWS - 2 - k;
    if (y >= 1) put(x + (k % 4 === 3 ? 1 : 0), y, k < 4 ? "." : k < 9 ? "o" : "O", "hot");
  }
  // fish, the far ones first
  for (const fish of FISH) {
    const w = Math.max(...fish.art.map((l) => l.length));
    const lap = (((fish.at + f * fish.step) % fish.span) + fish.span) % fish.span;
    const x0 = Math.floor(lap) - w; // from just off the left edge to off the right
    fish.art.forEach((line, dy) => [...line].forEach((c, dx) => put(x0 + dx, fish.row + dy, c, fish.colour)));
  }
  return { ch, co };
}

const frames = Array.from({ length: N }, (_, f) => frame(f));
const colours = ["blue", "dim", "green", "mid", "bone", "hot", "yellow", "cyan", "red"];
const layers = colours.map((colour) => ({
  colour,
  frames: frames.map(({ ch, co }) => ch.map((row, y) => row.map((c, x) => (co[y][x] === colour ? c : " ")).join("").replace(/\s+$/, "")).join("\n")),
}));
const out = new URL("../scenes.js", import.meta.url);
writeFileSync(out, `// Written by art/make.mjs; do not edit.\nexport const SCENES = ${JSON.stringify({ aquarium: { cols: COLS, rows: ROWS, ms: MS, layers } })};\n`);
if (process.argv[2]) console.log(frames[Number(process.argv[2])].ch.map((r) => r.join("")).join("\n"));

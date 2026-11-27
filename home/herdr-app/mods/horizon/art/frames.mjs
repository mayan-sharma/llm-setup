// Renders the turning disc: one loop of the hole's disc as raw RGBA frames, brightness in
// the alpha channel so only its light is drawn. export.sh packs them into disc-N.webp.
//   node frames.mjs <out folder> [frames] [pixels]
import { writeFileSync, mkdirSync } from "node:fs";
import "./hole.js";

const H = globalThis.Hole;
const out = process.argv[2];
const FRAMES = Number(process.argv[3]) || 120;
const N = Number(process.argv[4]) || 528;
const SS = 2;
mkdirSync(out, { recursive: true });

// Trace once: where each sample's ray meets the disc never changes, only the gas there.
const per = 2 * H.outer / N / H.rs; // Schwarzschild radii per pixel
const start = new Uint32Array(N * N * SS * SS + 1);
const hits = [];
let n = 0;
for (let py = 0; py < N; py++)
  for (let px = 0; px < N; px++)
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        start[n++] = hits.length / 5;
        H.trace((px + (sx + 0.5) / SS - N / 2) * per, -(py + (sy + 0.5) / SS - N / 2) * per, (l, g, b, rc, phi) => hits.push(l, g, b, rc, phi));
      }
start[n] = hits.length / 5;
const hit = Float32Array.from(hits);

const edge = new Float32Array(N * N);
for (let py = 0; py < N; py++)
  for (let px = 0; px < N; px++) edge[py * N + px] = 1 - H.sm(H.inner, H.outer, Math.hypot(px + 0.5 - N / 2, py + 0.5 - N / 2) * (2 * H.outer / N));

for (let f = 0; f < FRAMES; f++) {
  const turn = f / FRAMES;
  const buf = Buffer.alloc(N * N * 4);
  for (let p = 0; p < N * N; p++) {
    let R = 0, G = 0, B = 0;
    for (let s = p * SS * SS; s < (p + 1) * SS * SS; s++)
      for (let h = start[s]; h < start[s + 1]; h++) {
        const I = hit[h * 5] * H.tex(hit[h * 5 + 3], hit[h * 5 + 4], turn);
        R += I; G += I * hit[h * 5 + 1]; B += I * hit[h * 5 + 2];
      }
    const q = SS * SS;
    const r = 1 - Math.exp(-R / q * 1.25), g = 1 - Math.exp(-G / q * 1.25), b = 1 - Math.exp(-B / q * 1.25);
    const m = Math.max(r, g, b);
    if (m <= 0) continue;
    buf[p * 4] = 255 * r / m; buf[p * 4 + 1] = 255 * g / m; buf[p * 4 + 2] = 255 * b / m;
    buf[p * 4 + 3] = 255 * m * edge[p];
  }
  writeFileSync(`${out}/${String(f).padStart(4, "0")}.rgba`, buf);
}
console.log(`${FRAMES} frames, ${N}px`);

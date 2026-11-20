// Strategium feeds for the Cogitator layout: ambient mod panes. props: { feed }
//   auspex    - sweeping scanner with contacts
//   vox       - scrolling vox-log
//   noosphere - streaming hex data
//   vitals    - machine-spirit gauges
// Everything moves natively (.spin, .loop, .frames): no timers, so a hidden copy costs nothing.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, agents, settings } from "herdr";

const A = "mods/cogitator-feeds/";
const DISPLAY = "Cinzel Decorative";
const MONO = "JetBrains Mono";

const C = {
  ink: "#050805",
  brass: "#d4a82a",
  brassDim: "#5a4819",
  bone: "#e8dfbc",
  boneDim: "#a89c72",
  dim: "#6f6646",
  green: "#39ff6a",
  greenMid: "#27c152",
  greenDim: "#1f8f3d",
  amber: "#ffb000",
  red: "#ff3b2f",
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w) => String(n).padStart(w, "0");
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, "0");

const VOX = [
  "VOX//SQUAD VARRO: LANDING ZONE SECURE. ADVANCING ON GRID 7-KAPPA",
  "AUSPEX: THERMAL BLOOM DETECTED, BEARING 214, RANGE 1.2 KM",
  "ENGINSEER ORDAN: PLASMA COIL RE-CONSECRATED. OUTPUT NOMINAL",
  "VOX//SERGEANT KAEL: CONTACT FRONT. WEAPONS FREE",
  "LOGIS: MUNITIONS AT 64 PERCENT. RESUPPLY DROP REQUESTED",
  "STRATEGIUM: ORBITAL AUGURS REPORT MOVEMENT IN THE LOWER HIVE",
  "VOX//SQUAD HESK: BREACH CHARGE SET. THREE. TWO. ONE",
  "COGITATOR: CIPHER ROTATION COMPLETE. CHANNEL XVII SECURE",
  "APOTHECARION: TWO WOUNDED, BOTH COMBAT EFFECTIVE",
  "VOX//BROTHER TALLUS: HOLDING THE GANTRY. NONE SHALL PASS",
  "AUGUR ARRAY: WARP EDDIES RECEDING. TRANSIT WINDOW OPENS IN 0412",
  "REACTOR: OUTPUT 97 PERCENT. MACHINE SPIRIT APPEASED",
  "VOX//SQUAD VARRO: OBJECTIVE PRIMUS TAKEN. NO SURVIVORS FOUND",
  "SERVITOR 7-GAMMA: RITE OF COMPILATION CONCLUDED WITHOUT ERROR",
  "STRATEGIUM: REDEPLOY TO MANUFACTORUM DELTA. PRIORITY CRIMSON",
  "VOX//SERGEANT KAEL: ARMOUR INBOUND. REQUEST HEAVY SUPPORT",
  "AUSPEX: SIX CONTACTS, CLOSING FAST, VECTOR 088",
  "ORDNANCE: BOMBARDMENT SOLUTION LOCKED. AWAITING THE WORD",
  "VOX//SQUAD HESK: TUNNEL COLLAPSED BEHIND US. PRESSING ON",
  "COGITATOR: 4,096 DATA-PSALMS VERIFIED. ZERO HERESIES LOGGED",
  "VOID SHIELDS: BANK TWO FLICKERING. COMPENSATING",
  "VOX//BROTHER TALLUS: GANTRY HELD. SEND THE NEXT WAVE",
  "LOGIS: FUEL RESERVES SUFFICIENT FOR NINE DAYS OF WAR",
  "STRATEGIUM: ALL SQUADS, HOLD FAST. DAWN IS FOUR HOURS OUT",
  "ENGINSEER ORDAN: SACRED UNGUENTS APPLIED. THE ENGINE WAKES",
  "VOX//SQUAD VARRO: WE STAND. WE ENDURE. OUT",
];

const PSALMS = [
  "++ DATA-PSALM 0417 VERIFIED ++",
  "++ CIPHER KEY ROTATED ++",
  "++ CHECKSUM RIGHTEOUS ++",
  "++ NO CORRUPTION FOUND ++",
  "++ BINHARIC CANT ACKNOWLEDGED ++",
  "++ PACKET SANCTIFIED ++",
];

const GAUGES = [
  { label: "REACTOR OUTPUT", color: C.amber, from: 0.82, to: 0.97, period: 5200 },
  { label: "VOID SHIELDS", color: C.green, from: 0.9, to: 1, period: 7400 },
  { label: "PLASMA COIL TEMP", color: C.red, from: 0.42, to: 0.71, period: 3600 },
  { label: "COGITATION LOAD", color: C.green, from: 0.18, to: 0.86, period: 2900 },
  { label: "VOX SIGNAL", color: C.greenMid, from: 0.5, to: 0.95, period: 4300 },
  { label: "MUNITIONS", color: C.brass, from: 0.64, to: 0.64, period: 0 },
  { label: "AUGUR ARRAY", color: C.amber, from: 0.3, to: 0.6, period: 6100 },
];

export default class CogitatorFeeds extends View {
  init() {
    this.size = { width: 520, height: 340 };
    this.seed = Math.floor(Math.random() * 1e9);
    this.cache = {};
  }

  // ── shared frame ───────────────────────────────────────────────────────
  shell(title, tag, body) {
    return v_flex()
      .id("cf-root")
      .size_full()
      .overflow_hidden()
      .bg(C.ink)
      .font_family(MONO)
      .text_size(12)
      .text_color(C.green)
      .on_size_change((size, cx) => {
        // Reported sizes include the app zoom; style units don't.
        const z = Number(settings()?.zoom) || 1;
        const next = { width: size.width / z, height: size.height / z };
        if (Math.abs(next.width - this.size.width) > 1 || Math.abs(next.height - this.size.height) > 1) {
          this.size = next;
          cx.notify();
        }
      })
      .child(
        h_flex()
          .flex_none()
          .px(10)
          .pt(8)
          .pb(6)
          .gap(8)
          .items_center()
          .child(div().flex_none().font_family(DISPLAY).text_color(C.brass).child(title))
          .child(div().flex_1().h(1).bg(C.brassDim))
          .child(div().flex_none().text_size(10).text_color(C.dim).child(tag)),
      )
      .child(body);
  }

  render() {
    const feed = props()?.feed ?? "auspex";
    if (feed === "vox") return this.vox();
    if (feed === "noosphere") return this.noosphere();
    if (feed === "vitals") return this.vitals();
    return this.auspex();
  }

  // ── auspex ─────────────────────────────────────────────────────────────
  contacts() {
    if (!this.cache.contacts) {
      const r = rng(this.seed);
      this.cache.contacts = Array.from({ length: 6 }, (_, i) => {
        const brg = Math.floor(r() * 360);
        const rngKm = 0.3 + r() * 2.5;
        return { n: i + 1, brg, km: rngKm, hostile: i < 4 ? r() > 0.35 : false, period: 900 + Math.floor(r() * 1600) };
      });
    }
    return this.cache.contacts;
  }

  auspex() {
    const W = this.size.width - 20;
    const H = this.size.height - 44;
    const wide = W > H * 1.25;
    const side = Math.max(80, Math.floor(wide ? Math.min(H, W * 0.56) : Math.min(W, H * 0.64)));
    const list = this.contacts();

    const blip = (c) => {
      const rad = (c.brg * Math.PI) / 180;
      const d = (c.km / 3) * (side / 2) * 0.94;
      const s = c.hostile ? 7 : 5;
      return div()
        .absolute()
        .left(side / 2 + Math.sin(rad) * d - s / 2)
        .top(side / 2 - Math.cos(rad) * d - s / 2)
        .w(s)
        .h(s)
        .rounded(s / 2)
        .bg(c.hostile ? C.red : C.green)
        .loop("opacity", { from: 0.05, to: 1, period: c.period });
    };

    const radar = div()
      .relative()
      .flex_none()
      .w(side)
      .h(side)
      .child(image(A + "grid.svg").absolute().top(0).left(0).w(side).h(side))
      .child(div().absolute().top(0).left(0).child(svg(A + "sweep.svg").size(side).text_color(C.green).spin(4200)))
      .children(list.map(blip));

    const row = (c) => {
      const drift = [0, 0.02, 0.05, 0.03, -0.01, -0.04].map((x) => `${Math.max(0.1, c.km + x).toFixed(2)}KM`);
      return h_flex()
        .gap(8)
        .items_center()
        .child(div().flex_none().w(6).h(6).bg(c.hostile ? C.red : C.green).loop("opacity", { from: 0.2, to: 1, period: c.period }))
        .child(div().flex_none().text_color(C.bone).child(`CONTACT ${pad(c.n, 2)}`))
        .child(div().flex_none().text_color(C.boneDim).child(`BRG ${pad(c.brg, 3)}`))
        .child(div().flex_none().w(52).text_color(C.boneDim).frames(drift, 1300))
        .child(div().flex_1().min_w(0).truncate().text_color(c.hostile ? C.red : C.greenMid).child(c.hostile ? "HOSTILE" : "FRIENDLY"));
    };

    const hostile = list.filter((c) => c.hostile).length;
    const readout = v_flex()
      .flex_1()
      .min_w(0)
      .min_h(0)
      .overflow_hidden()
      .gap(5)
      .text_size(11)
      .child(h_flex().gap(8).child(div().text_color(C.dim).child("SWEEP")).child(div().text_color(C.green).frames(["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE ·", "ACTIVE ··", "ACTIVE ···"], 500)))
      .child(h_flex().gap(8).child(div().text_color(C.dim).child("RANGE")).child(div().text_color(C.bone).child("3.00KM")))
      .child(
        h_flex()
          .gap(8)
          .child(div().text_color(C.dim).child("THREAT"))
          .child(div().text_color(hostile > 2 ? C.red : C.amber).loop("opacity", { from: 0.35, to: 1, period: 1100 }).child(hostile > 2 ? "SEVERE" : "ELEVATED")),
      )
      .child(div().h(1).my(3).bg(C.brassDim))
      .children(list.map(row));

    const body = (wide ? h_flex().items_start() : v_flex().items_center()).flex_1().min_h(0).px(10).pb(8).gap(14).child(radar).child(readout);
    return this.shell("AUSPEX", `${pad(list.length, 2)} CONTACTS`, body);
  }

  // ── vox log ────────────────────────────────────────────────────────────
  vox() {
    const rows = Math.max(3, Math.floor((this.size.height - 44 - 26) / 19));
    const n = VOX.length;
    const stamp = (k) => `${pad(4 + Math.floor(k / 60), 2)}:${pad((k * 7) % 60, 2)}:${pad((k * 23) % 60, 2)}`;
    const line = (i) =>
      h_flex()
        .flex_none()
        .h(19)
        .gap(10)
        .items_center()
        .child(div().flex_none().text_color(C.dim).frames(VOX.map((_, k) => stamp(k + i)), 1700))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_color(i === rows - 1 ? C.green : C.greenMid)
            .frames(VOX.map((_, k) => VOX[(k + i) % n]), 1700),
        );

    const body = v_flex()
      .flex_1()
      .min_h(0)
      .px(10)
      .pb(6)
      .overflow_hidden()
      .children(Array.from({ length: rows }, (_, i) => line(i)))
      .child(
        h_flex()
          .flex_none()
          .h(22)
          .gap(8)
          .items_center()
          .child(div().text_color(C.brass).child("VOX>"))
          .child(div().w(8).h(14).bg(C.green).loop("opacity", { from: 0, to: 1, period: 1000 })),
      );
    return this.shell("VOX-LOG", "CHANNEL XVII · SECURE", body);
  }

  // ── noosphere ──────────────────────────────────────────────────────────
  noosphere() {
    const rows = Math.max(3, Math.floor((this.size.height - 44) / 17));
    const cols = Math.floor((this.size.width - 20) / 7.25);
    const bytes = Math.max(4, Math.min(32, Math.floor((cols - 7) / 3)));
    const key = `n${rows}x${bytes}`;
    if (!this.cache[key]) {
      const r = rng(this.seed + 11);
      const data = () => Array.from({ length: bytes }, () => hex(Math.floor(r() * 256), 2)).join(" ");
      this.cache = {
        contacts: this.cache.contacts,
        [key]: Array.from({ length: rows }, (_, i) => {
          const addr = Math.floor(r() * 0xf000);
          if (i % 9 === 4) return { psalm: true, frames: PSALMS.map((_, k) => PSALMS[(k + i) % PSALMS.length]), period: 2600 };
          return {
            frames: Array.from({ length: 7 }, (_, k) => `${hex(addr + k * 16, 4)}: ${data()}`),
            period: 110 + Math.floor(r() * 5) * 45,
            color: r() > 0.86 ? C.amber : r() > 0.7 ? C.green : C.greenDim,
          };
        }),
      };
    }
    const body = v_flex()
      .flex_1()
      .min_h(0)
      .px(10)
      .overflow_hidden()
      .children(
        this.cache[key].map((row) =>
          div()
            .flex_none()
            .h(17)
            .whitespace_nowrap()
            .overflow_hidden()
            .text_color(row.psalm ? C.brass : row.color)
            .frames(row.frames, row.period),
        ),
      );
    return this.shell("NOOSPHERE", "BINHARIC FEED", body);
  }

  // ── vitals ─────────────────────────────────────────────────────────────
  vitals() {
    const track = Math.max(60, this.size.width - 20 - 150 - 56 - 20);
    const ag = agents();
    const working = ag.filter((a) => a.status === "working").length;
    const blocked = ag.filter((a) => a.status === "blocked").length;

    const gauge = (g) => {
      const steps = [0, 0.35, 0.7, 1, 0.6, 0.2].map((x) => `${((g.from + (g.to - g.from) * x) * 100).toFixed(1)}%`);
      const fill = div().absolute().top(0).left(0).h(10).bg(g.color);
      return h_flex()
        .flex_none()
        .h(22)
        .gap(10)
        .items_center()
        .child(div().flex_none().w(150).truncate().text_color(C.boneDim).child(g.label))
        .child(
          div()
            .relative()
            .flex_none()
            .w(track)
            .h(12)
            .border_1()
            .border_color(C.brassDim)
            .child(g.period ? fill.loop("width", { from: g.from * (track - 2), to: g.to * (track - 2), period: g.period }) : fill.w(g.from * (track - 2))),
        )
        .child(g.period ? div().flex_none().w(56).text_right().text_color(g.color).frames(steps, Math.max(400, g.period / 3)) : div().flex_none().w(56).text_right().text_color(g.color).child(steps[0]));
    };

    const body = v_flex()
      .flex_1()
      .min_h(0)
      .px(10)
      .pb(8)
      .overflow_hidden()
      .text_size(11)
      .children(GAUGES.map(gauge))
      .child(div().flex_none().h(1).my(8).bg(C.brassDim))
      .child(
        h_flex()
          .flex_none()
          .gap(10)
          .items_center()
          .child(div().w(10).h(10).bg(blocked ? C.red : C.green).loop("opacity", { from: 0.25, to: 1, period: blocked ? 600 : 1800 }))
          .child(div().font_family(DISPLAY).text_size(15).text_color(blocked ? C.red : C.green).child(blocked ? "MACHINE SPIRIT · RESTLESS" : "MACHINE SPIRIT · APPEASED")),
      )
      .child(
        div()
          .flex_none()
          .pt(6)
          .truncate()
          .text_color(C.dim)
          .child(`${pad(ag.length, 2)} SERVITORS BOUND · ${pad(working, 2)} LABOURING · ${pad(blocked, 2)} AWAITING ORDERS`),
      );
    return this.shell("VITALS", "ENGINARIUM", body);
  }
}

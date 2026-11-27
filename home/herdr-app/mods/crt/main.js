// CRT: a phosphor-green terminal desk, one mod in roles.
// The layout gives each copy props { role }:
//   bar   top line: space name, tabs as slanted channel plates, agent summary
//   side  left monitor: spaces, agents, Claude usage limits
//   sys   right monitor: big clock, then three pages (SCOPE radar, SYS meters, LOG of agent events)
//   pane  a pane's header (the layout's pane header)
// As the layout's "toast" it draws notifications. With no role (herdr-app check) it draws every part once.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, spaces, agents, panes, run, exec, home, appHome, checking, setAgentOrder, openOverlay, closeOverlay, layout, shared, setShared, nextCommand, readTextFile, window as win } from "herdr";

const FONT = "PxPlus IBM VGA 8x16";
const C = {
  hot: "#39ff7a", // lit phosphor
  text: "#8dffb0",
  mid: "#4fbf74",
  dim: "#2f7d4b",
  line: "#143f25",
  plate: "#0b2a18", // an unlit tab plate
  ink: "#021006", // text on a lit block
  glass: "#04110a80", // a monitor's face: the scanlines show through
  wash: "#39ff7a14", // the shown row
  amber: "#ffb000",
  red: "#ff5f56",
  redWash: "#ff5f5622",
};
const TONE = { blocked: C.red, working: C.amber, done: C.hot, idle: C.mid };

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const two = (n) => String(n).padStart(2, "0");
const clock = (d = new Date()) => `${two(d.getHours())}:${two(d.getMinutes())}`;

function tilde(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// "4m", "2h", "3d": how long ago (or how far ahead) in the fewest characters.
function span(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_mouse_down("right", (_e, cx) => cx.stop_propagation());
}

// An agent status as one character; working spins, blocked blinks, idle is blank.
function mark(status, color) {
  if (status === "working") return div().flex_none().w(8).text_color(color ?? C.amber).frames(["|", "/", "-", "\\"], 140);
  if (status === "blocked") return div().flex_none().w(8).text_color(color ?? C.red).frames(["!", " "], 420);
  if (status === "done") return div().flex_none().w(8).text_color(color ?? C.hot).child("√");
  return div().flex_none().w(8);
}

const cursor = (color = C.hot) => div().flex_none().w(8).text_color(color).frames(["█", " "], 530);

// Whether the shown layout has this node hidden (searches the tree).
function layoutHides(id, node = layout()) {
  if (!node || typeof node !== "object") return false;
  if (node.id === id) return Boolean(node.hidden);
  return (node.children ?? []).some((c) => layoutHides(id, c));
}

// A section title: the word, a hairline, a count.
const heading = (text, note = "") =>
  h_flex()
    .flex_none()
    .px(14)
    .pb(6)
    .gap(8)
    .items_center()
    .child(div().flex_none().text_color(C.mid).child(text))
    .child(div().flex_1().h(1).bg(C.line))
    .when(Boolean(note), (el) => el.child(div().flex_none().text_color(C.dim).child(note)));

// A meter of lit segments. `low`: running out is the problem (battery).
function segments(value, { count = 12, low = false, w = 6, h = 8 } = {}) {
  const known = typeof value === "number" && value >= 0;
  const pct = known ? Math.max(0, Math.min(100, value)) : 0;
  const bad = low ? 100 - pct : pct;
  const color = bad >= 90 ? C.red : bad >= 75 ? C.amber : C.mid;
  const lit = known ? Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * count)) : 0;
  return h_flex()
    .flex_none()
    .gap(2)
    .children(Array.from({ length: count }, (_x, i) => div().flex_none().w(w).h(h).bg(i < lit ? color : C.line)));
}

// HUD brackets: a lit L in each corner of a frame.
function brackets(color = C.mid, leg = 12) {
  const bar = () => div().absolute().bg(color);
  return [
    bar().top(0).left(0).w(leg).h(1),
    bar().top(0).left(0).w(1).h(leg),
    bar().top(0).right(0).w(leg).h(1),
    bar().top(0).right(0).w(1).h(leg),
    bar().bottom(0).left(0).w(leg).h(1),
    bar().bottom(0).left(0).w(1).h(leg),
    bar().bottom(0).right(0).w(leg).h(1),
    bar().bottom(0).right(0).w(1).h(leg),
  ];
}

// The shell of a side monitor: a thin bezel, corner brackets, a slow sweeping beam.
function monitor(self, id, body) {
  const height = self.size?.height ?? 400;
  return v_flex()
    .id(id)
    .relative()
    .size_full()
    .overflow_hidden()
    .rounded(3)
    .border_1()
    .border_color(C.line)
    .bg(C.glass)
    .font_family(FONT)
    .text_size(16)
    .text_color(C.text)
    .on_size_change((size, cx) => {
      self.size = size;
      cx.notify();
    })
    .child(div().absolute().left(0).w_full().h(64).bg("#39ff7a06").loop("top", { from: -64, to: height, period: 12000, easing: "linear" }))
    .child(body)
    .children(brackets());
}

// A slanted plate: the tab shape of this layout. `fill` is the plate, the caller fills `body`.
function plate(id, fill, body, h = 22) {
  return h_flex()
    .id(id)
    .flex_none()
    .h(h)
    .items_center()
    .child(svg("mods/crt/art/tab-l.svg").flex_none().w(8).h(h).text_color(fill))
    .child(body.h(h).bg(fill))
    .child(svg("mods/crt/art/tab-r.svg").flex_none().w(8).h(h).text_color(fill));
}

// ---- bar ---------------------------------------------------------------

class Bar {
  init(_p, cx) {
    this.stamp = clock();
    cx.timer.every(10000, (cx) => {
      const next = clock();
      if (next !== this.stamp) {
        this.stamp = next;
        cx.notify();
      }
    });
  }

  render() {
    const w = win() ?? {};
    const space = spaces().find((s) => s.active);
    const list = agents();
    const count = (status) => list.filter((a) => a.status === status).length;
    const blocked = count("blocked");
    const working = count("working");
    const done = count("done");

    // A channel plate per tab: lit when shown, amber while its agent works, red when it waits on you.
    const tab = (t) => {
      const fill = t.active ? C.hot : t.status === "blocked" ? "#4a1512" : C.plate;
      const tone = t.active ? C.ink : t.status === "blocked" ? C.red : t.status === "working" ? C.amber : t.status === "done" ? C.hot : C.mid;
      return own(
        plate(
          `crt-tab-${t.id}`,
          fill,
          h_flex()
            .px(6)
            .gap(8)
            .items_center()
            .text_color(tone)
            .child(div().flex_none().text_color(t.active ? "#0b5a2a" : C.dim).child(two(t.index)))
            .when(t.named, (el) => el.child(div().max_w(200).truncate().child(t.name)))
            .when(Boolean(t.status) && t.status !== "idle", (el) => el.child(mark(t.status, t.active ? C.ink : undefined))),
        ),
      )
        .cursor_pointer()
        .when(!t.active, (el) => el.hover((s) => s.opacity(0.75)))
        .on_click(() => run("tab.select", { id: t.id }))
        .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: t.id, space: space.id } } }));
    };

    const chip = (n, label, color, blink = false) =>
      h_flex()
        .flex_none()
        .gap(6)
        .items_center()
        .text_color(color)
        .child(blink ? div().flex_none().w(8).frames(["■", " "], 420) : div().flex_none().w(8).child("■"))
        .child(`${two(n)} ${label}`);

    return h_flex()
      .size_full()
      .px(6)
      .gap(12)
      .items_center()
      .overflow_hidden()
      .font_family(FONT)
      .text_size(16)
      .text_color(C.text)
      // macOS: the window buttons sit here (the layout's traffic_lights).
      .when(w.platform === "macos" && w.titlebar === "none" && !w.fullscreen, (el) => el.pl(80))
      .child(
        h_flex()
          .flex_none()
          .child(div().text_color(C.dim).child("HERDR//"))
          .child(div().max_w(260).truncate().text_color(C.hot).child((space?.name ?? "no space").toUpperCase()))
          .child(cursor()),
      )
      .child(h_flex().flex_shrink(1).min_w(0).items_center().overflow_hidden().children((space?.tabs ?? []).map(tab)))
      .child(
        own(div())
          .id("crt-new-tab")
          .flex_none()
          .cursor_pointer()
          .text_color(C.dim)
          .hover((s) => s.text_color(C.hot))
          .on_click(() => run("tab.new", space ? { space: space.id } : {}))
          .child("[+]"),
      )
      .child(div().flex_1().min_w(12).h(1).bg(C.line))
      .when(blocked > 0, (el) => el.child(chip(blocked, "BLOCKED", C.red, true)))
      .when(done > 0, (el) => el.child(chip(done, "DONE", C.hot)))
      .when(working > 0, (el) => el.child(chip(working, "WORKING", C.amber)))
      .when(blocked + done + working === 0, (el) => el.child(div().flex_none().text_color(C.dim).child("ALL QUIET")))
      // The big clock is on the right monitor; the bar keeps time only while that is hidden.
      .when(Boolean(layoutHides("crt-right")), (el) => el.child(div().flex_none().text_color(C.mid).child(this.stamp)));
  }
}

// ---- side: spaces, agents, usage limits -----------------------------------

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const LIMITS = [
  ["five_hour", "5H"],
  ["seven_day", "7D"],
  ["seven_day_opus", "OP"],
  ["seven_day_sonnet", "SN"],
];

class Side {
  init(_p, cx) {
    this.limits = null;
    if (checking()) return;
    // The elapsed times count minutes; the limits file is rewritten by the Claude status line.
    cx.timer.every(30000, (cx) => {
      this.readLimits(cx);
      if (agents().some((a) => a.status === "working")) cx.notify();
    });
    this.readLimits(cx);
  }

  readLimits(cx) {
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${home()}/.claude/usage-limits.json`);
        const next = text ? JSON.parse(text).limits ?? null : null;
        if (JSON.stringify(next) !== JSON.stringify(this.limits)) {
          this.limits = next;
          cx.notify();
        }
      } catch (_e) {
        // No file, or half written: keep the last reading.
      }
    });
  }

  render() {
    const all = spaces();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));
    const since = new Map(all.flatMap((s) => s.tabs.map((t) => [t.id, t.working_since])));
    const now = Date.now();

    const row = (id, n, shown, status, onClick) =>
      h_flex()
        .id(id)
        .flex_none()
        .h(26)
        .pr(14)
        .gap(8)
        .items_center()
        .cursor_pointer()
        .when(shown, (el) => el.bg(C.wash).text_color(C.hot))
        .when(!shown && status === "blocked", (el) => el.bg(C.redWash).text_color(C.red))
        .when(!shown && status !== "blocked", (el) => el.text_color(C.mid).hover((s) => s.text_color(C.text).bg("#39ff7a0a")))
        .on_click(onClick)
        // The lit edge marks the shown row.
        .child(div().flex_none().w(2).h(26).mr(4).bg(shown ? C.hot : status === "blocked" ? C.red : "#00000000"))
        .child(div().flex_none().text_color(shown ? C.mid : C.dim).child(two(n)));

    const space = (s, i) =>
      row(`crt-space-${s.id}`, i + 1, s.active, s.status, () => run("space.select", { id: s.id }))
        .child(div().flex_1().min_w(0).truncate().child(s.name))
        .when(s.tabs.length > 1, (el) => el.child(div().flex_none().text_color(C.dim).child(`:${s.tabs.length}`)))
        .child(mark(s.status));

    const agent = (a, i) => {
      const from = a.status === "working" ? since.get(a.tab) : null;
      return row(`crt-agent-${a.address}`, i + 1, a.focused, a.status, () => run("pane.focus", { pane: a.pane }))
        .child(div().flex_1().min_w(0).truncate().child(a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : `${a.space_name}/${a.tab_name}`))
        .when(Boolean(from), (el) => el.child(div().flex_none().text_color("#a87400").child(span(now - from))))
        .child(mark(a.status));
    };

    const limits = LIMITS.filter(([key]) => this.limits?.[key]).map(([key, label]) => {
      const l = this.limits[key];
      const pct = Math.round(l.used_percentage ?? 0);
      const left = l.resets_at ? l.resets_at * 1000 - now : 0;
      return h_flex()
        .flex_none()
        .h(22)
        .px(14)
        .gap(8)
        .items_center()
        .child(div().flex_none().w(16).text_color(C.dim).child(label))
        .child(segments(pct, { count: 10 }))
        .child(div().flex_1().text_color(pct >= 90 ? C.red : pct >= 75 ? C.amber : C.mid).child(`${pct}%`))
        .when(left > 0, (el) => el.child(div().flex_none().text_color(C.dim).child(span(left))));
    });

    return monitor(
      this,
      "crt-side",
      v_flex()
        .flex_1()
        .min_h(0)
        .child(
          v_flex()
            .id("crt-side-list")
            .flex_1()
            .min_h(0)
            .pt(14)
            .overflow_y_scrollbar()
            .child(heading("SPACES", two(all.length)))
            .children(all.map(space))
            .child(div().flex_none().h(18))
            .child(heading("AGENTS", two(list.length)))
            .children(list.map(agent))
            .when(list.length === 0, (el) => el.child(div().flex_none().px(14).text_color(C.line).child("none"))),
        )
        .when(limits.length > 0, (el) => el.child(v_flex().flex_none().pt(10).pb(12).child(heading("QUOTA")).children(limits))),
    );
  }
}

// ---- sys ---------------------------------------------------------------

// 3x5 pixel digits, drawn two pixel rows per text row with half blocks.
const DIGITS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "001", "001"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"],
};

function bigText(text) {
  const rows = ["", "", "", "", "", ""];
  for (const ch of text) {
    const glyph = DIGITS[ch];
    if (!glyph) continue;
    for (let y = 0; y < 6; y++) rows[y] += (glyph[y] ?? "0".repeat(glyph[0].length)) + "0";
  }
  const out = [];
  for (let y = 0; y < 6; y += 2) {
    let line = "";
    for (let x = 0; x < rows[y].length - 1; x++) {
      const top = rows[y][x] === "1";
      const bottom = rows[y + 1][x] === "1";
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    out.push(line);
  }
  return out;
}

const big = (text) =>
  v_flex()
    .flex_none()
    .children(bigText(text).map((line) => div().flex_none().whitespace_nowrap().child(line)));

// The agent radar: every agent is a contact. The more it needs you, the
// nearer the centre; its bearing is fixed by its address.
const RADAR = 176;
const RANGE = { blocked: 0.22, done: 0.42, working: 0.62, idle: 0.84 };

// Golden-angle steps on the terminal number spread neighbours (t21, t22) apart.
function bearing(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  const n = Number(String(text).match(/(\d+)\s*$/)?.[1] ?? h);
  return ((n * 137.508) % 360) * (Math.PI / 180);
}

function radar(list) {
  const mid = RADAR / 2;
  const contact = (a) => {
    const size = a.status === "idle" ? 4 : 6;
    const r = (RANGE[a.status] ?? 0.84) * (mid - 6);
    const t = bearing(a.address);
    return div()
      .id(`crt-blip-${a.address}`)
      .absolute()
      .left(Math.round(mid + r * Math.sin(t) - size / 2))
      .top(Math.round(mid - r * Math.cos(t) - size / 2))
      .w(size)
      .h(size)
      .bg(TONE[a.status] ?? C.mid)
      .cursor_pointer()
      .when(a.status === "blocked", (el) => el.loop("opacity", { from: 0.15, to: 1, period: 600 }))
      .when(a.status === "working", (el) => el.loop("opacity", { from: 0.45, to: 1, period: 1600 }))
      .on_click(() => run("pane.focus", { pane: a.pane }));
  };
  return div()
    .relative()
    .flex_none()
    .w(RADAR)
    .h(RADAR)
    .child(svg("mods/crt/art/radar.svg").absolute().top(0).left(0).size(RADAR).text_color("#1f6a3a"))
    .child(svg("mods/crt/art/sweep.svg").absolute().top(0).left(0).size(RADAR).text_color(C.hot).spin(5000))
    .children(list.map(contact));
}

const PAGES = ["scope", "sys", "log"];
const HISTORY = 34; // samples in a trace: 34 bars of 4px and 2px gaps fill the page
const EVENT = { working: "RUN", blocked: "WAIT", done: "DONE", idle: "IDLE" };

// A trace of past readings as bars, newest on the right and lit.
function trace(samples, height = 20) {
  const pad = Array.from({ length: Math.max(0, HISTORY - samples.length) }, () => null);
  return h_flex()
    .flex_none()
    .h(height)
    .gap(2)
    .items_end()
    .border_b_1()
    .border_color(C.line)
    .children(
      [...pad, ...samples].map((v, i) =>
        div()
          .flex_none()
          .w(4)
          .h(v === null ? 0 : Math.max(1, Math.round((Math.min(100, v) / 100) * height)))
          .bg(i === HISTORY - 1 ? C.hot : v >= 90 ? C.red : v >= 75 ? C.amber : C.dim),
      ),
    );
}

const rate = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}M` : bytes >= 1024 ? `${Math.round(bytes / 1024)}K` : `${Math.round(bytes)}B`);

class Sys {
  init(_p, cx) {
    this.time = clock();
    this.stats = null;
    this.cpu = [];
    this.mem = [];
    this.net = null;
    this.seen = null;
    this.log = [];
    try {
      this.log = JSON.parse(localStorage.getItem("crt.log") ?? "[]");
    } catch (_e) {
      this.log = [];
    }
    cx.timer.every(10000, (cx) => {
      const next = clock();
      if (next !== this.time) {
        this.time = next;
        cx.notify();
      }
    });
    if (checking()) return;
    cx.timer.every(5000, (cx) => this.poll(cx));
    this.poll(cx);
    // keys.json: "crt.page" turns to the next page.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "page") setShared("crt.page", PAGES[(PAGES.indexOf(this.page()) + 1) % PAGES.length]);
        cx.notify();
      }
    });
  }

  page() {
    const p = shared("crt.page");
    return PAGES.includes(p) ? p : "scope";
  }

  poll(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", [`${appHome()}/mods/crt/stats.sh`], { timeout: 4000 });
        const s = JSON.parse(r.stdout);
        this.cpu = [...this.cpu, s.cpu].slice(-HISTORY);
        this.mem = [...this.mem, s.mem].slice(-HISTORY);
        const last = this.raw;
        this.raw = s;
        if (last && s.now > last.now && Array.isArray(s.net) && Array.isArray(last.net)) {
          const dt = s.now - last.now;
          this.net = { down: Math.max(0, s.net[0] - last.net[0]) / dt, up: Math.max(0, s.net[1] - last.net[1]) / dt };
        }
        this.stats = s;
        // Only the SYS page shows any of this: the other pages are not redrawn for it.
        if (this.page() === "sys") cx.notify();
      } catch (_e) {
        // Keep the last reading.
      }
    });
  }

  // Notes every change of an agent's status, newest first. Runs on render, which follows the agents.
  track(list) {
    const now = new Map(list.map((a) => [a.address, a.status]));
    if (this.seen) {
      let changed = false;
      for (const a of list) {
        const was = this.seen.get(a.address);
        if (was === a.status || (!was && a.status === "idle")) continue;
        const name = a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : `${a.space_name}/${a.tab_name}`;
        this.log.unshift({ at: clock(), name, status: a.status, pane: a.pane });
        changed = true;
      }
      if (changed) {
        this.log = this.log.slice(0, 40);
        try {
          localStorage.setItem("crt.log", JSON.stringify(this.log));
        } catch (_e) {
          // The log still shows until the layout closes.
        }
      }
    }
    this.seen = now;
  }

  scope(list) {
    const hot = list.filter((a) => a.status !== "idle").length;
    const key = (label, color) => h_flex().gap(4).items_center().child(div().w(6).h(6).bg(color)).child(div().text_color(C.dim).child(label));
    return v_flex()
      .flex_1()
      .min_h(0)
      .child(div().flex_1())
      .child(h_flex().flex_none().justify_center().child(radar(list)))
      .child(
        h_flex()
          .flex_none()
          .pt(10)
          .justify_between()
          .child(div().text_color(C.dim).child(`${two(list.length)} CONTACTS`))
          .child(div().text_color(hot ? C.amber : C.line).child(hot ? `${two(hot)} ACTIVE` : "ALL QUIET")),
      )
      .child(div().flex_1())
      .child(h_flex().flex_none().justify_between().child(key("WAIT", C.red)).child(key("DONE", C.hot)).child(key("RUN", C.amber)).child(key("IDLE", C.mid)));
  }

  machine() {
    const s = this.stats ?? {};
    const value = (v) => (typeof v === "number" && v >= 0 ? `${v}%` : "--");
    const meter = (label, v, low = false) =>
      h_flex()
        .flex_none()
        .gap(10)
        .items_center()
        .child(div().flex_none().w(28).text_color(C.dim).child(label))
        .child(segments(v, { low }))
        .child(div().flex_1())
        .child(div().flex_none().text_color(C.mid).child(value(v)));
    const fact = (label, text) => h_flex().flex_none().h(18).gap(10).items_center().child(div().flex_none().w(36).text_color(C.dim).child(label)).child(div().flex_1().min_w(0).truncate().text_color(C.mid).child(text));
    const up = typeof s.up === "number" ? (s.up >= 2880 ? `${Math.floor(s.up / 1440)}D ${Math.floor((s.up % 1440) / 60)}H` : `${Math.floor(s.up / 60)}H ${s.up % 60}M`) : "--";
    return v_flex()
      .flex_1()
      .min_h(0)
      .gap(6)
      .pt(2)
      .overflow_hidden()
      .child(meter("CPU", s.cpu))
      .child(trace(this.cpu))
      .child(meter("MEM", s.mem))
      .child(trace(this.mem))
      .child(meter("DSK", s.disk))
      .child(meter(s.ac ? "AC" : "BAT", s.bat, true))
      .child(div().flex_none().h(1).my(2).bg(C.line))
      .child(fact("LOAD", s.load ?? "--"))
      .child(fact("UP", up))
      .child(fact("NET", this.net ? `↓${rate(this.net.down)} ↑${rate(this.net.up)}` : "--"))
      .child(div().flex_none().h(1).my(2).bg(C.line))
      .children(
        (s.top ?? []).slice(0, 4).map((p) =>
          h_flex()
            .flex_none()
            .h(18)
            .gap(8)
            .items_center()
            .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(p.n))
            .child(div().flex_none().text_color(p.c >= 90 ? C.amber : C.mid).child(`${p.c}%`)),
        ),
      );
  }

  events() {
    const live = new Set(panes().map((p) => p.pane));
    return v_flex()
      .id("crt-log")
      .flex_1()
      .min_h(0)
      .pt(2)
      .overflow_y_scrollbar()
      .when(this.log.length === 0, (el) => el.child(h_flex().flex_none().gap(8).text_color(C.dim).child("NO EVENTS YET").child(cursor(C.dim))))
      .children(
        this.log.map((e, i) =>
          v_flex()
            .id(`crt-ev-${i}`)
            .flex_none()
            .pb(8)
            .when(live.has(e.pane), (el) => el.cursor_pointer().hover((s) => s.bg(C.wash)).on_click(() => run("pane.focus", { pane: e.pane })))
            .child(
              h_flex()
                .gap(8)
                .child(div().flex_none().text_color(C.dim).child(e.at))
                .child(div().flex_none().text_color(TONE[e.status] ?? C.mid).child(EVENT[e.status] ?? String(e.status).toUpperCase())),
            )
            .child(div().truncate().text_color(i === 0 ? C.text : C.mid).child(e.name)),
        ),
      );
  }

  render() {
    const d = new Date();
    const list = agents();
    this.track(list);
    const page = this.page();
    const [hh, mm] = this.time.split(":");
    const week = Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);

    const tab = (name) =>
      plate(
        `crt-page-${name}`,
        name === page ? C.hot : C.plate,
        h_flex()
          .px(3)
          .items_center()
          .text_color(name === page ? C.ink : C.mid)
          .child(name.toUpperCase()),
      )
        .cursor_pointer()
        .when(name !== page, (el) => el.hover((s) => s.opacity(0.75)))
        .on_click(() => setShared("crt.page", name));

    return monitor(
      this,
      "crt-sys",
      v_flex()
        .flex_1()
        .min_h(0)
        .px(19)
        .pt(22)
        .pb(16)
        .overflow_hidden()
        .child(
          h_flex()
            .flex_none()
            .gap(12)
            .text_size(24)
            .line_height("24px")
            .text_color(C.hot)
            .child(big(hh))
            // The colon ticks: the only part of the clock that moves between minutes.
            .child(big(":").loop("opacity", { from: 0.2, to: 1, period: 1000 }))
            .child(big(mm)),
        )
        .child(
          h_flex()
            .flex_none()
            .pt(12)
            .justify_between()
            .child(div().text_color(C.mid).child(`${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}`))
            .child(div().text_color(C.dim).child(`WK${two(week)}`)),
        )
        .child(h_flex().flex_none().pt(14).items_end().children(PAGES.map(tab)).child(div().flex_1().h(1).bg(C.line)))
        .child(div().flex_none().h(12))
        .child(page === "sys" ? this.machine() : page === "log" ? this.events() : this.scope(list)),
    );
  }
}

// ---- pane header -------------------------------------------------------

class Pane {
  button(id, label, command, args) {
    return div()
      .id(id)
      .flex_none()
      .cursor_pointer()
      .text_color(C.dim)
      .hover((s) => s.text_color(C.hot))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(label);
  }

  render() {
    const all = panes();
    const p = all.find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const title = p.title || p.program?.name || "shell";
    const where = tilde(p.cwd);
    const dir = where && !title.includes(where) && !/^[~/]/.test(title) ? where : "";
    const kind = (p.program?.shell ? "SH" : p.program?.key ?? p.mod ?? "").toUpperCase().slice(0, 8);
    const back = p.scroll?.from_bottom > 0;
    return h_flex()
      .id(`crt-pane-${pane}`)
      .size_full()
      .pr(14)
      .gap(10)
      .items_center()
      .overflow_hidden()
      .font_family(FONT)
      .text_size(16)
      .border_b_1()
      .border_color(p.focused ? "#1c5a33" : C.line)
      .on_click(() => run("pane.focus", { pane }))
      // The program's name on a plate: lit where the keyboard is.
      .when(Boolean(kind), (el) => el.child(h_flex().flex_none().h_full().px(10).items_center().bg(p.focused ? C.hot : C.plate).text_color(p.focused ? C.ink : C.mid).child(kind)))
      .when(!kind, (el) => el.child(div().w(4)))
      .child(mark(p.status))
      .child(div().flex_none().max_w(420).truncate().text_color(p.focused ? C.text : C.dim).child(title))
      .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(dir))
      .when(back, (el) => el.child(div().flex_none().text_color(C.amber).child("▲ HISTORY")))
      .when(Boolean(p.branch), (el) => el.child(div().flex_none().max_w(200).truncate().text_color(p.focused ? C.mid : C.dim).child(`± ${p.branch}`)))
      .child(div().flex_none().text_color(C.dim).child(String(p.terminal ?? "").toUpperCase()))
      // Controls only where the keyboard is: the other panes stay quiet.
      .when(p.focused, (el) =>
        el
          .child(this.button(`crt-pr-${pane}`, "→", "pane.split", { direction: "right", pane }))
          .child(this.button(`crt-pd-${pane}`, "↓", "pane.split", { direction: "down", pane }))
          .child(this.button(`crt-pz-${pane}`, p.zoomed ? "-" : "+", "pane.zoom", { pane }))
          .child(this.button(`crt-px-${pane}`, "x", "pane.close", { pane })),
      );
  }
}

// ---- notifications -------------------------------------------------------
// Props { title, body, level, action, overlay }. Press it to run its action; it goes either way.

const LEVEL = { error: ["ERR", C.red], warning: ["WARN", C.amber], success: ["OK", C.hot], info: ["MSG", C.mid] };

class Toast {
  render() {
    const p = this.sample ?? props() ?? {};
    const [tag, color] = LEVEL[p.level] ?? LEVEL.info;
    return h_flex()
      .id("crt-toast")
      .relative()
      .size_full()
      .bg("#04110a")
      .font_family(FONT)
      .text_size(16)
      .cursor_pointer()
      .hover((s) => s.bg("#07190f"))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        if (p.overlay) closeOverlay(p.overlay);
      })
      .child(h_flex().flex_none().h_full().w(52).justify_center().items_center().bg(color).text_color(C.ink).child(tag))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .px(12)
          .justify_center()
          .child(h_flex().child(div().min_w(0).truncate().text_color(p.level === "error" ? C.red : C.hot).child(String(p.title ?? "").toUpperCase())).child(cursor(color)))
          .when(Boolean(p.body), (el) => el.child(div().truncate().text_color(C.mid).child(p.body))),
      )
      .children(brackets(color, 8));
  }
}

// ---- entry -------------------------------------------------------------

const ROLES = { bar: Bar, side: Side, sys: Sys, pane: Pane };
const SAMPLES = [
  { title: "review #639 finished", body: "root · tab 3", level: "success" },
  { title: "intent to build is waiting", body: "needs your answer", level: "error" },
];

export default class Crt extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    if (pr.role) {
      const R = ROLES[pr.role];
      this.role = R ? new R() : null;
      this.role?.init?.(pr, cx);
      return;
    }
    if (pr.overlay && ("title" in pr || "body" in pr || "level" in pr)) {
      this.role = new Toast();
      return;
    }
    // No role: every part once, so a check exercises all of them.
    this.gallery = Object.values(ROLES).map((R) => {
      const r = new R();
      r.init?.(pr, cx);
      return r;
    });
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (this.gallery)
      return v_flex()
        .size_full()
        .gap(8)
        .children(SAMPLES.map((sample) => div().flex_none().h(56).w(360).child(Object.assign(new Toast(), { sample }).render())))
        .children(this.gallery.map((r) => div().flex_none().h(160).child(r.render(cx))));
    return div().child(`crt: no role "${props()?.role}"`);
  }
}

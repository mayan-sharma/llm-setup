// Pixel: a 16-colour night camp. Everything sits on a 2px grid and is set in
// Departure Mono; the sky (art/make.mjs) is the layout's background image.
// The layout gives each copy props { role }:
//   rail   every space with its tabs, then the camp: moon, tent, the herder and
//          the fire, with Claude's usage as gauges in the ground beneath it
//   strip  the shown space's tabs as notched plates, the date and the time
//   pane   a pane's header on the glass
//   side   the right panel (hidden until asked for): SYS, the machine as cell
//          gauges, plus any pages a hidden .work.js beside this file adds
//   sidetabs  the plates over the right panel, one a page
// The layout also names this mod as its "toast": notifications arrive with a title and no role.
// Keys (keys.json, "layout:pixel"): cmd-; layout.toggle:pixel-side, cmd-shift-j pixel.page.
// A tab's mark: a turning block while its agent works, a blinking "!" plate when it
// needs you, a green tick when it finished, a small z when idle, a prompt for a
// plain shell. The tab on screen is yellow, with a menu cursor beside it.
// With no role (herdr-app check, mod.open): a gallery.

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, settings, spaces, agents, panes, run, exec, home, appHome, checking, layout, shared, setShared, nextCommand, setAgentOrder, openOverlay, closeOverlay, readTextFile, window as win } from "herdr";

const ART = "mods/pixel/art";
const CAMP = { file: `${ART}/camp-1.png`, w: 91, h: 66, fire: 59.5, floor: 38 }; // art px; art/make.mjs
const FONT = "Departure Mono";
const C = {
  white: "#f4f4f4",
  fog: "#94b0c2",
  slate: "#566c86",
  navy: "#333c57",
  night: "#1a1c2c",
  ink: "#0b0c15",
  yellow: "#ffcd75",
  orange: "#ef7d57",
  red: "#b13e53",
  green: "#a7f070",
  cyan: "#73eff7",
  purple: "#5d275d",
  grass: "#38b764",
  teal: "#257179",
  deep: "#29366f",
  blue: "#41a6f6",
  hover: "#94b0c214",
  none: "#00000000",
};

const two = (n) => String(n).padStart(2, "0");
const zoom = () => Number(settings()?.zoom) || 1;

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
}

function text(value, colour = C.fog, size = 11) {
  return div().flex_none().font_family(FONT).text_size(size).line_height(`${Math.round(size * 1.28)}px`).text_color(colour).child(String(value));
}

// A sprite from rows of characters: `key` maps a character to a colour, anything
// else is empty. Each run of one colour is one block, `p` px to the art pixel.
function sprite(rows, key, p = 2) {
  const el = div().relative().flex_none().w(rows[0].length * p).h(rows.length * p);
  const blocks = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      // half a px taller than its row, so no seam opens between rows at a fractional zoom
      if (key[ch]) blocks.push(div().absolute().left(x * p).top(y * p).w(n * p).h(p + 0.5).bg(key[ch]));
      x += n;
    }
  });
  return el.children(blocks);
}

const TICK = ["......#", ".....##", "#...##.", "##.##..", ".###...", "..#...."];
const ZED = ["#####", "...#.", "..#..", ".#...", "#####"];
const PROMPT = ["#....", ".#...", "..#..", ".#...", "#...."];
const CURSOR = ["#..", "##.", "###", "##.", "#.."];
const BRANCH = ["#...#", "#...#", "#..#.", "###..", "#....", "#...."];
const SHEEP = [".wwww...", "wwwwwwhh", "wwwwwwhh", "wwwwww..", ".k..k..."];

const PANEL = ["#########", "#.....#.#", "#.....#.#", "#.....#.#", "#.....#.#", "#.....#.#", "#########"];
const CROSS = ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"];

// ---- the side panel's state ---------------------------------------------------

let PAGES = ["sys"]; // more from .work.js, further down
const page = () => (PAGES.includes(shared("pixel.page")) ? shared("pixel.page") : "sys");
const setPage = (name) => setShared("pixel.page", name);
const togglePanel = () => run("layout.toggle", { id: "pixel-side" });

// Whether the shown layout has this node hidden (searches the tree).
function layoutHides(id, node = layout()) {
  if (!node || typeof node !== "object") return false;
  if (node.id === id) return Boolean(node.hidden);
  return (node.children ?? []).some((c) => layoutHides(id, c));
}

// The mark for a status, in a 14px square.
function mark(status) {
  const box = h_flex().flex_none().w(14).h(14).items_center().justify_center();
  if (status === "working") return box.child(div().w(8).h(8).relative().child(spinner()));
  if (status === "blocked")
    return box.child(
      h_flex().w(14).h(14).items_center().justify_center().bg(C.orange).child(div().font_family(FONT).text_size(11).line_height("14px").text_color(C.ink).frames(["!", "!", "!", " "], 260)),
    );
  if (status === "done") return box.child(sprite(TICK, { "#": C.green }));
  if (status === "idle") return box.child(sprite(ZED, { "#": C.slate }));
  return box.child(sprite(PROMPT, { "#": C.slate }));
}

// One 4px block stepping round an 8px square: text frames of half blocks, so it
// steps and never glides. At this size a cell is 4px wide and 8px tall.
function spinner() {
  return div().absolute().left(0).top(0).w(8).h(8).overflow_hidden().font_family(FONT).text_size(6.29).line_height("8px").text_color(C.cyan).frames(["▀ ", " ▀", " ▄", "▄ "], 150);
}

function tabLabel(t, all) {
  if (t.named) return t.name;
  const mine = all.filter((p) => p.tab === t.id);
  const p = mine.find((x) => x.status) ?? mine[0];
  const title = String(p?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
  return title || p?.program?.name || `tab ${t.index}`;
}

function openTab(s, t) {
  if (!s.active) run("space.select", { id: s.id });
  run("tab.select", { id: t.id });
}

function tabMenu(s, t) {
  openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: t.id, space: s.id } } });
}

// ---- rail ------------------------------------------------------------------

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const LIMITS = { five_hour: "5H", seven_day: "7D", seven_day_opus: "OP", seven_day_sonnet: "SN" };
const CELLS = 12;

// The file the Claude Code status line saves, as rows. A limit whose window has started over is left out.
function readLimits(raw) {
  let data = null;
  try {
    data = JSON.parse(raw ?? "null");
  } catch {
    return [];
  }
  const now = Date.now();
  return Object.entries(data?.limits ?? {})
    .filter(([, v]) => v && Number.isFinite(v.used_percentage) && (!v.resets_at || v.resets_at * 1000 > now))
    .map(([key, v]) => ({ name: LIMITS[key] ?? key.slice(0, 2).toUpperCase(), used: Math.round(v.used_percentage) }));
}

// Stars over the camp, each blinking at its own pace. Decoration only.
const STARS = [
  // across (0..1), down (px), size, colour, ms
  [0.08, 6, 2, C.white, 2900],
  [0.3, 22, 2, C.fog, 4700],
  [0.52, 4, 2, C.cyan, 3700],
  [0.64, 34, 2, C.fog, 6100],
  [0.93, 12, 2, C.white, 5300],
  [0.42, 48, 2, C.slate, 4100],
];

// A spark is one block of text. Each frame lifts it a line; empty frames are the wait.
function sparkFrames(rise, drift, wait) {
  const list = [];
  for (let i = 0; i < rise; i++) list.push("\n".repeat(rise - i) + " ".repeat(Math.max(0, 2 + Math.round(drift * i))) + "▄");
  for (let i = 0; i < wait; i++) list.push("");
  return list;
}
const SPARKS = [
  { frames: sparkFrames(11, 0.35, 9), ms: 130, colour: C.yellow },
  { frames: sparkFrames(8, -0.2, 21), ms: 170, colour: C.orange },
];

class Rail {
  init(_p, cx) {
    this.width = null; // the rail's width as the window measures it (zoom included)
    this.usage = [];
    const read = (cx) =>
      readTextFile(`${home()}/.claude/usage-limits.json`)
        .then((raw) => {
          const next = readLimits(raw);
          if (JSON.stringify(next) !== JSON.stringify(this.usage)) {
            this.usage = next;
            cx.notify();
          }
        })
        .catch(() => {});
    read(cx);
    cx.timer.every(30000, read);
  }

  // A flame is a column standing on the logs whose height swings on its own clock.
  flame(x, base, colour, from, to, period) {
    return div().absolute().left(x).bottom(base).w(3).h(from).bg(colour).loop("height", { from, to, period });
  }

  // The camp at the rail's foot, with everything that moves in it.
  camp(width) {
    const k = width / CAMP.w;
    const height = Math.round(CAMP.h * k);
    const fx = Math.round(CAMP.fire * k - 1.5); // the middle flame's left edge
    const base = Math.round((CAMP.h - CAMP.floor) * k) + 2;
    return div()
      .relative()
      .flex_none()
      .w_full()
      .h(height)
      .children(STARS.map(([x, y, size, colour, period]) => div().absolute().left(Math.round(x * width)).top(y).w(size).h(size).bg(colour).loop("opacity", { from: 0.1, to: 1, period })))
      .child(div().absolute().left(0).top(0).w(width).h(height).child(image(CAMP.file).w(width).h(height)))
      // the flames: red at the edges, orange, yellow at the heart
      .child(this.flame(fx - 6, base, C.red, 3, 8, 410))
      .child(this.flame(fx - 3, base, C.orange, 7, 15, 290))
      .child(this.flame(fx, base, C.orange, 11, 22, 230))
      .child(this.flame(fx + 3, base, C.orange, 6, 16, 330))
      .child(this.flame(fx + 6, base, C.red, 3, 9, 370))
      .child(this.flame(fx - 3, base, C.yellow, 3, 7, 250))
      .child(this.flame(fx, base, C.yellow, 5, 12, 190))
      .child(this.flame(fx + 3, base, C.yellow, 3, 8, 310))
      .children(
        SPARKS.map((s, i) =>
          div()
            .absolute()
            .left(fx - 9 + i * 6)
            .bottom(base + 20)
            .w(60)
            .h(s.frames.length * 3)
            .overflow_hidden()
            .font_family(FONT)
            .text_size(4.7)
            .line_height("3px")
            .text_color(s.colour)
            .frames(s.frames, s.ms),
        ),
      )
      .child(this.gauges());
  }

  // Claude's usage, as two cell gauges set into the ground.
  gauges() {
    if (!this.usage.length) return div();
    return v_flex()
      .absolute()
      .left(16)
      .right(16)
      .bottom(16)
      .gap(8)
      .children(
        this.usage.slice(0, 2).map(({ name, used }) => {
          const lit = Math.max(used > 0 ? 1 : 0, Math.min(CELLS, Math.round((used / 100) * CELLS)));
          const colour = used >= 85 ? C.orange : used >= 60 ? C.yellow : C.green;
          return h_flex()
            .gap(10)
            .items_center()
            .child(text(name, C.slate).w(18))
            .child(
              h_flex()
                .flex_1()
                .gap(2)
                .children(Array.from({ length: CELLS }, (_, i) => div().flex_1().h(8).bg(i < lit ? colour : "#333c5790"))),
            )
            .child(text(`${used}%`, used >= 85 ? C.orange : C.fog).w(34).text_right());
        }),
      );
  }

  row(s, t, all) {
    const shown = s.active && t.active;
    const needs = t.status === "blocked";
    const quiet = !t.status || t.status === "idle";
    return own(h_flex())
      .id(`px-tab-${t.id}`)
      .relative()
      .flex_none()
      .h(26)
      .pl(28)
      .pr(14)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .hover((st) => st.bg(C.hover))
      .on_click(() => openTab(s, t))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, t);
      })
      .when(shown, (el) => el.child(div().absolute().left(14).top(8).child(sprite(CURSOR, { "#": C.yellow }))))
      .child(mark(t.status))
      .child(text(tabLabel(t, all), shown ? C.yellow : needs ? C.white : quiet ? C.slate : C.fog).flex_1().min_w(0).truncate());
  }

  space(s, all) {
    const tabs = s.tabs.filter((t) => !t.settled);
    return v_flex()
      .flex_none()
      .pb(10)
      .child(
        own(h_flex())
          .id(`px-space-${s.id}`)
          .flex_none()
          .h(28)
          .pl(14)
          .pr(14)
          .gap(10)
          .items_center()
          .cursor_pointer()
          .on_click(() => run("space.select", { id: s.id }))
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
          })
          .child(div().flex_none().w(6).h(6).bg(s.active ? C.yellow : C.navy))
          .child(text(String(s.name).toUpperCase(), s.active ? C.white : C.slate).flex_shrink(1).min_w(0).truncate())
          .child(div().flex_1().min_w(8).h(2).bg(s.active ? "#566c8670" : "#333c5780")),
      )
      .children(tabs.map((t) => this.row(s, t, all)));
  }

  render() {
    const w = win() ?? {};
    const all = panes();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));
    const lights = w.platform === "macos" && !w.fullscreen;
    const width = Math.round((this.width ?? 272 * zoom()) / zoom());

    return v_flex()
      .id("px-rail")
      .relative()
      .size_full()
      .overflow_hidden()
      .font_family(FONT)
      .on_size_change((size, cx) => {
        if (this.width && Math.abs(size.width - this.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .child(div().absolute().top(0).right(0).w(2).h_full().bg("#333c5770"))
      .child(
        h_flex()
          .flex_none()
          .h(lights ? 80 : 56)
          .pl(14)
          .pt(lights ? 30 : 4)
          .gap(10)
          .items_center()
          .child(sprite(SHEEP, { w: C.white, h: C.fog, k: C.slate }))
          .child(text("HERDR", C.white, 16.5)),
      )
      .child(
        v_flex()
          .id("px-list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(spaces().map((s) => this.space(s, all)))
          .child(
            own(div())
              .id("px-space-new")
              .flex_none()
              .pl(14)
              .pb(8)
              .cursor_pointer()
              .child(text("+ SPACE", C.navy).hover((st) => st.text_color(C.white)))
              .on_click(() => run("space.new")),
          ),
      )
      .child(this.camp(width));
  }
}

// ---- strip: the shown space's tabs, the date and the time -------------------

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const clock = (d = new Date()) => `${two(d.getHours())}:${two(d.getMinutes())}`;

class Strip {
  init(_p, cx) {
    this.time = clock();
    cx.timer.every(10000, (cx) => {
      const next = clock();
      if (next !== this.time) {
        this.time = next;
        cx.notify();
      }
    });
  }

  // A plate with its top corners notched by one 2px step. The shown tab's plate is
  // yellow and open at the foot, so it runs into the pane below.
  tab(s, t, all, room) {
    const edge = t.active ? C.yellow : C.navy;
    return own(h_flex())
      .id(`px-st-${t.id}`)
      .relative()
      .flex_none()
      .h(30)
      .px(14)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .on_click(() => openTab(s, t))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, t);
      })
      .child(div().absolute().left(2).right(2).top(2).bottom(0).bg(t.active ? "#1a1c2ce6" : "#0b0c1599"))
      .child(div().absolute().left(2).right(2).top(0).h(2).bg(edge))
      .child(div().absolute().left(0).top(2).bottom(0).w(2).bg(edge))
      .child(div().absolute().right(0).top(2).bottom(0).w(2).bg(edge))
      .when(!t.active, (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(2).bg(C.navy)))
      .child(mark(t.status))
      .child(text(tabLabel(t, all), t.active ? C.yellow : C.fog).max_w(room).truncate());
  }

  render() {
    const all = panes();
    const s = spaces().find((x) => x.active);
    const tabs = (s?.tabs ?? []).filter((t) => !t.settled);
    const d = new Date();
    // Every tab stays on the strip: when they would not fit, their names give way evenly.
    const free = (this.width ?? 1240) / zoom() - 8 - 40 - 12 - 170 - 42;
    const room = Math.max(24, Math.min(190, Math.floor(free / Math.max(1, tabs.length)) - 56));
    return h_flex()
      .id("px-strip")
      .relative()
      .size_full()
      .overflow_hidden()
      .items_end()
      .font_family(FONT)
      .on_size_change((size, cx) => {
        if (Math.abs((this.width ?? 0) - size.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .child(div().absolute().left(0).bottom(0).w_full().h(2).bg(C.navy))
      .child(h_flex().flex_shrink(1).min_w(0).pl(8).gap(4).items_end().overflow_hidden().children(tabs.map((t) => this.tab(s, t, all, room))))
      .child(
        own(h_flex())
          .id("px-tab-new")
          .flex_none()
          .w(40)
          .h(30)
          .items_center()
          .justify_center()
          .cursor_pointer()
          .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
          .child(text("+", C.slate, 16.5).hover((st) => st.text_color(C.yellow))),
      )
      .child(div().flex_1().min_w(12))
      .child(
        h_flex()
          .flex_none()
          .h(30)
          .gap(14)
          .pr(18)
          .items_center()
          .child(text(`${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}`, C.slate))
          .child(text(this.time, C.white))
          .child(this.toggle("px-tg-side", sprite(PANEL, { "#": layoutHides("pixel-side") ? C.slate : C.yellow }), togglePanel)),
      );
  }

  toggle(id, icon, fn) {
    return own(h_flex()).id(id).flex_none().w(28).h(26).items_center().justify_center().cursor_pointer().hover((st) => st.bg(C.hover)).on_click(fn).child(icon);
  }
}

// ---- pane header -----------------------------------------------------------

function folderName(cwd) {
  if (!cwd) return "";
  if (cwd === home()) return "~";
  return cwd.split("/").filter(Boolean).pop() ?? "";
}

class Pane {
  button(id, glyph, command, args) {
    return div()
      .id(id)
      .flex_none()
      .cursor_pointer()
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(text(glyph, C.slate).hover((st) => st.text_color(C.yellow)));
  }

  render() {
    const all = panes();
    const p = all.find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const split = all.filter((x) => x.tab === p.tab).length > 1;
    const name = String(p.program?.name || p.title || "shell").toLowerCase();
    const folder = folderName(p.cwd);
    return h_flex()
      .id(`px-pane-${pane}`)
      .relative()
      .size_full()
      .px(16)
      .gap(10)
      .items_center()
      .overflow_hidden()
      .font_family(FONT)
      .on_click(() => run("pane.focus", { pane }))
      .child(div().absolute().left(0).bottom(0).w_full().h(2).bg("#333c5780"))
      // Among several panes, the one with the keyboard carries the yellow line.
      .when(split && p.focused, (el) => el.child(div().absolute().left(0).top(0).w_full().h(2).bg(C.yellow)))
      .child(mark(p.status))
      .child(text(name, p.focused ? C.white : C.slate).flex_shrink(1).min_w(0).truncate())
      .when(Boolean(folder), (el) => el.child(text(folder, C.slate).flex_shrink(1).min_w(0).truncate()))
      .when(p.status === "blocked", (el) => el.child(text("NEEDS YOU", C.orange)))
      .child(div().flex_1().min_w(0))
      .when(Boolean(p.branch), (el) => el.child(h_flex().flex_none().max_w(320).gap(8).items_center().child(sprite(BRANCH, { "#": C.slate })).child(text(p.branch ?? "", C.fog).flex_shrink(1).min_w(0).truncate())))
      .when(split && p.focused, (el) =>
        el
          .child(this.button(`px-pz-${pane}`, p.zoomed ? "[-]" : "[+]", "pane.zoom", { pane }))
          .child(this.button(`px-px-${pane}`, "[x]", "pane.close", { pane })),
      );
  }
}

// ---- side panel -------------------------------------------------------------
// SYS reads the machine (stats.sh). Other pages, their data and their timers come from .work.js.

const EVERY = { stats: 5000 };
const NEEDS = { sys: ["stats"] };

async function gather(what, arg) {
  if (what === "stats") return JSON.parse((await exec("sh", [`${appHome()}/mods/pixel/stats.sh`], { timeout: 4000 })).stdout);
  return WORK.gather(what, arg);
}

const tone = (v) => (v >= 85 ? C.orange : v >= 60 ? C.yellow : C.green);
const rate = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}M/S` : `${Math.round(b / 1024)}K/S`);
const uptime = (m) => (m >= 1440 ? `${Math.floor(m / 1440)}D ${Math.floor((m % 1440) / 60)}H` : `${Math.floor(m / 60)}H ${two(m % 60)}M`);
const up = (v) => String(v ?? "").toUpperCase();

function heading(label, right) {
  return h_flex()
    .flex_none()
    .h(28)
    .gap(10)
    .items_center()
    .child(div().flex_none().w(6).h(6).bg(C.yellow))
    .child(text(label, C.white))
    .child(div().flex_1().h(2).bg("#566c8670"))
    .when(Boolean(right), (el) => el.child(right));
}

// A named gauge of 16 cells with its value at the end.
function meter(name, value, colour, note) {
  const n = 16;
  const lit = Math.max(value > 0 ? 1 : 0, Math.min(n, Math.round((value / 100) * n)));
  return h_flex()
    .flex_none()
    .h(22)
    .gap(10)
    .items_center()
    .child(text(name, C.slate).w(26))
    .child(h_flex().flex_1().gap(2).children(Array.from({ length: n }, (_, i) => div().flex_1().h(10).bg(i < lit ? colour : "#333c5790"))))
    .child(text(note ?? `${value}%`, C.fog).w(38).text_right());
}

const pair = (name, value) => h_flex().flex_none().h(20).gap(10).child(text(name, C.slate).w(44)).child(text(value, C.fog).flex_1().min_w(0).truncate());
const quiet = (msg, colour = C.slate) => div().flex_none().py(4).child(text(up(msg), colour).whitespace_normal());
const space = () => div().flex_none().h(10);

// A bracketed word that acts: slate until the pointer is on it.
function action(id, label, fn) {
  return div()
    .id(id)
    .flex_none()
    .cursor_pointer()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => {
      cx.stop_propagation();
      fn(e, cx);
    })
    .child(text(`[${label}]`, C.slate).hover((st) => st.text_color(C.yellow)));
}

// A solid plate with ink lettering.
const tag = (label, colour) => h_flex().flex_none().h(16).px(6).items_center().bg(colour).child(text(label, C.ink));

// Two lines behind a mark: what it is, then the detail.
function entry(id, lead, title, detail, right, onClick) {
  const el = h_flex().id(id).flex_none().py(5).gap(10).items_start();
  return (onClick ? el.cursor_pointer().hover((st) => st.bg(C.hover)).on_click(onClick) : el)
    .child(lead)
    .child(v_flex().flex_1().min_w(0).gap(3).child(text(title, C.white).truncate()).child(text(detail, C.slate).truncate()))
    .when(Boolean(right), (e) => e.child(right));
}

const box = (el) => h_flex().flex_none().w(14).h(14).items_center().justify_center().child(el);
const ok = () => box(sprite(TICK, { "#": C.green }));
const bad = () => box(sprite(CROSS, { "#": C.orange }));
const warn = () => h_flex().flex_none().w(14).h(14).items_center().justify_center().bg(C.yellow).child(text("!", C.ink));
const none = () => box(div().w(8).h(2).bg(C.slate));
const busyMark = () => box(div().w(8).h(8).relative().child(spinner()));

// More pages from a file kept beside this one on the machines that have it (it is hidden, so
// it is never published): it gets this drawing kit and returns its pages, data and roles.
let WORK = null;
try {
  WORK = (await import("./.work.js")).default({ C, FONT, text, heading, pair, quiet, space, action, tag, entry, ok, bad, warn, none, busyMark, up });
  PAGES = ["sys", ...WORK.pages];
  Object.assign(EVERY, WORK.every);
  Object.assign(NEEDS, WORK.needs);
} catch (e) {
  if (!/not found|no such|cannot find|resolve|load/i.test(String(e))) console.log("pixel: .work.js failed", String(e));
}

class Side {
  init(_p, cx) {
    this.data = {};
    this.errors = {};
    this.busy = {};
    this.loaded = {};
    this.tried = {};
    this.net = null;
    this.note = null;
    this.allPorts = false;
    if (checking()) return;
    for (const what of Object.keys(EVERY)) this.load(what, cx);
    // Only what the page on screen shows is asked for again, each at its own pace.
    cx.timer.every(2500, (cx) => {
      if (layoutHides("pixel-side")) return;
      for (const what of NEEDS[page()]) if (Date.now() - (this.tried[what] ?? 0) >= EVERY[what]) this.load(what, cx);
    });
  }

  load(what, cx) {
    if (this.busy[what]) return;
    this.busy[what] = true;
    this.tried[what] = Date.now();
    cx.spawn(async (cx) => {
      try {
        const d = await gather(what);
        const last = this.data.stats;
        if (what === "stats" && last && d.now > last.now && Array.isArray(d.net) && Array.isArray(last.net)) {
          const dt = d.now - last.now;
          this.net = { down: Math.max(0, d.net[0] - last.net[0]) / dt, up: Math.max(0, d.net[1] - last.net[1]) / dt };
        }
        this.data[what] = d;
        this.errors[what] = d.error ?? null;
        this.loaded[what] = Date.now();
      } catch (e) {
        this.errors[what] = String(e.message ?? e);
      } finally {
        this.busy[what] = false;
        this.tell();
        if (NEEDS[page()].includes(what)) cx.notify();
      }
    });
  }

  // How many things on each page need attention, for the plates.
  tell() {
    const next = WORK?.attention(this);
    if (next && JSON.stringify(next) !== JSON.stringify(shared("pixel.attention") ?? null)) setShared("pixel.attention", next);
  }

  machine() {
    const s = this.data.stats;
    if (!s) return [quiet("reading the machine")];
    const top = Array.isArray(s.top) ? s.top : [];
    const rows = [heading("MACHINE"), meter("CPU", s.cpu, tone(s.cpu)), meter("MEM", s.mem, tone(s.mem)), meter("DSK", s.disk, tone(s.disk))];
    if (s.bat >= 0) rows.push(meter("BAT", s.bat, s.ac ? C.cyan : s.bat <= 20 ? C.orange : C.green));
    rows.push(space(), heading("VITALS"), pair("LOAD", s.load), pair("UP", uptime(s.up)), pair("POWER", s.bat < 0 ? "MAINS" : s.ac ? "CHARGER" : "BATTERY"));
    if (this.net) rows.push(pair("DOWN", rate(this.net.down)), pair("UP", rate(this.net.up)));
    rows.push(space(), heading("BUSIEST"));
    rows.push(...top.map((t) => h_flex().flex_none().h(20).gap(10).child(text(up(t.n), C.fog).flex_1().min_w(0).truncate()).child(text(`${t.c}%`, t.c >= 100 ? C.orange : C.slate).w(44).text_right())));
    return rows;
  }

  rows(which) {
    return which === "sys" || !WORK ? this.machine() : this.pageRows(which);
  }

  render() {
    const which = page();
    const first = NEEDS[which][0];
    const at = this.loaded[first];
    return v_flex()
      .id("px-side")
      .relative()
      .size_full()
      .overflow_hidden()
      .font_family(FONT)
      .child(div().absolute().top(0).left(0).w(2).h_full().bg("#333c5770"))
      .child(v_flex().id("px-side-body").flex_1().min_h(0).overflow_y_scrollbar().px(14).pt(6).pb(10).children(this.rows(which)))
      .child(
        h_flex()
          .flex_none()
          .relative()
          .h(32)
          .px(14)
          .items_center()
          .child(div().absolute().left(0).top(0).w_full().h(2).bg("#333c5780"))
          .child(text(this.busy[first] && which !== "sys" ? "UPDATING" : at ? `UPDATED ${clock(new Date(at))}` : "", C.slate).flex_1())
          .child(action("px-refresh", "REFRESH", (_e, cx) => NEEDS[which].forEach((what) => this.load(what, cx)))),
      );
  }
}

// The work pages' methods (local, prs, release, npm, their actions) join the side panel when they are here.
if (WORK) for (const name of Object.getOwnPropertyNames(WORK.Pages.prototype)) if (name !== "constructor") Side.prototype[name] = WORK.Pages.prototype[name];

class SideTabs {
  // keys.json: "pixel.page" turns the page.
  init(_p, cx) {
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "page") setPage(PAGES[(PAGES.indexOf(page()) + 1) % PAGES.length]);
        cx.notify();
      }
    });
  }

  // A notched plate, yellow when its page is on screen; a count beside the name when something there needs you.
  plate(name) {
    const on = page() === name;
    const edge = on ? C.yellow : C.navy;
    const n = shared("pixel.attention")?.[name] ?? 0;
    return h_flex()
      .id(`px-page-${name}`)
      .relative()
      .flex_none()
      .h(28)
      .px(8)
      .gap(5)
      .items_center()
      .cursor_pointer()
      .on_click(() => setPage(name))
      .child(div().absolute().left(2).right(2).top(0).h(2).bg(edge))
      .child(div().absolute().left(0).top(2).bottom(0).w(2).bg(edge))
      .child(div().absolute().right(0).top(2).bottom(0).w(2).bg(edge))
      .when(!on, (el) => el.child(div().absolute().left(0).right(0).bottom(0).h(2).bg(C.navy)))
      .child(text(name.toUpperCase(), on ? C.yellow : C.slate))
      .when(n > 0, (el) => el.child(text(n, C.orange)));
  }

  render() {
    return h_flex()
      .id("px-side-tabs")
      .relative()
      .size_full()
      .pl(8)
      .gap(2)
      .items_end()
      .font_family(FONT)
      .child(div().absolute().top(0).left(0).w(2).h_full().bg("#333c5770"))
      .child(div().absolute().left(0).bottom(0).w_full().h(2).bg(C.navy))
      .children(PAGES.map((name) => this.plate(name)))
      .child(div().flex_1())
      .child(div().flex_none().h(28).pr(14).child(action("px-side-close", "x", togglePanel).h(28).flex().items_center()));
  }
}

// ---- toast -------------------------------------------------------------------
// The layout names this mod as its "toast", so every notification (Herdr's own and
// any notify()) comes here with props { title, body, level, action, overlay } and no role.

const LEVEL = { error: C.orange, warning: C.yellow, success: C.green };

class Toast {
  render() {
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const lead = p.level === "error" ? bad() : p.level === "warning" ? warn() : p.level === "success" ? ok() : box(div().w(6).h(6).bg(C.cyan));
    const line = (value, colour) => (p.fitHeight ? text(value, colour).whitespace_normal() : text(String(value).split("\n", 1)[0], colour).truncate());
    return h_flex()
      .id("px-toast")
      .relative()
      .when(Boolean(p.fitHeight), (el) => el.w_full().min_h(70).flex_none().py(12))
      .when(!p.fitHeight, (el) => el.size_full())
      .pl(20)
      .pr(16)
      .gap(12)
      .items_center()
      .bg(C.night)
      .font_family(FONT)
      .cursor_pointer()
      .hover((st) => st.bg("#252947"))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(div().absolute().left(0).top(0).bottom(0).w(4).bg(LEVEL[p.level] ?? C.cyan))
      .child(lead)
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(4)
          .overflow_hidden()
          .child(line(login ? `${login[1]} needs a login` : (p.title ?? ""), C.white))
          .when(!login && Boolean(p.body), (el) => el.child(line(p.body, C.fog)))
          .when(Boolean(login), (el) => el.child(line(command, C.fog))),
      )
      .when(Boolean(login), (el) =>
        el.child(
          action("px-toast-copy", this.copied ? "COPIED" : "COPY", (_e, cx) => {
            cx.write_to_clipboard(command);
            this.copied = true;
            cx.notify();
          }),
        ),
      );
  }
}

// ---- entry -----------------------------------------------------------------

const ROLES = { rail: Rail, strip: Strip, pane: Pane, side: Side, sidetabs: SideTabs, toast: Toast, ...(WORK?.roles ?? {}) };

export default class Pixel extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role ?? (pr.overlay && "title" in pr ? "toast" : "")];
    if (R) {
      this.role = new R();
      this.role.init?.(pr, cx);
    }
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (props()?.role) return div().child(`pixel: no role "${props().role}"`);
    // The gallery: every mark as a rail row, then the camp with sample gauges.
    const rail = new Rail();
    rail.usage = [
      { name: "5H", used: 41 },
      { name: "7D", used: 88 },
    ];
    const sample = { id: "s", active: true };
    const fake = (status, i) => ({ id: `gallery-${i}`, index: i + 1, name: `${status ?? "shell"} tab`, named: true, active: i === 1, status });
    // Beside it: the side panel's pages with sample readings.
    const side = new Side();
    Object.assign(side, { errors: {}, busy: {}, loaded: {}, note: null, allPorts: true, net: { down: 1480000, up: 52000 } });
    side.data = {
      stats: { cpu: 37, mem: 71, disk: 88, bat: 64, ac: false, load: "2.10 1.84 1.66", up: 3190, top: [{ n: "node", c: 112 }, { n: "Herdr", c: 41 }, { n: "WindowServer", c: 18 }] },
      ...(WORK?.sample ?? {}),
    };
    return h_flex()
      .size_full()
      .items_start()
      .bg(C.night)
      .font_family(FONT)
      .child(
        v_flex()
          .flex_none()
          .w(272)
          .pt(16)
          .children(["working", "working", "done", "blocked", "idle", null].map((st, i) => rail.row(sample, fake(st, i), [])))
          .child(rail.camp(272)),
      )
      .children(PAGES.map((name) => v_flex().flex_none().w(300).px(14).children(side.rows(name))));
  }
}

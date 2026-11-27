// Sumi: a sheet of black handmade paper with pale ink on it. The terminal is
// the densest pool of ink; everything else is brush marks on the paper.
// The layout gives each copy props { role }:
//   rail   the paper on the left: every space with its tabs as brush marks, a plum branch in the corner
//   top    the strip above the terminal: tonight's moon and the time in words
//   pane   a pane's header, on the ink
//   blank  bare paper (margins)
// It also draws this layout's right-click menus (props { tab, target }) and its
// notifications (props { title, body, level }), both as slips of the same paper.
// A tab's mark: a breathing vermilion bloom when its agent needs you, a wet open
// stroke while it works, a closed dry circle with a seal when it finished, a pale
// wash when idle. With no role (herdr-app check, mod.open) it draws a gallery.

import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, settings, spaces, agents, panes, terminals, keys, run, exec, home, setAgentOrder, openOverlay, closeOverlay, readTextFile, window as win } from "herdr";

const ART = "mods/sumi/art";
const SERIF = "Didot";
const SANS = "Avenir Next";
const C = {
  ink: "#f1eada", // text on paper
  soft: "#bcb4a3",
  pale: "#857e72",
  faint: "#4b4640",
  red: "#e0452d", // the colour that calls you
  mark: "#e9e2d2", // brush marks
  hover: "#ffffff0f",
  slabText: "#e9e2d2", // text on the ink
  slabMute: "#8e877a",
  slabDim: "#5c564d",
  slabRed: "#f0674c",
};

const spaced = (text) => String(text).toUpperCase().split("").join(" ");
const two = (n) => String(n).padStart(2, "0");

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_mouse_down("right", (_e, cx) => cx.stop_propagation());
}

function tilde(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// An image, placed. The box is positioned and pulsed; the image only fills it.
function art(name, w, h, { x = 0, y = 0, pulse = null, absolute = true } = {}) {
  let box = div().flex_none().w(w).h(h).child(image(`${ART}/${name}.png`).w(w).h(h));
  if (absolute) box = box.absolute().left(x).top(y);
  return pulse ? box.loop("opacity", pulse) : box;
}

function hash(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return h;
}

// The brush mark for a status, in a `size` square.
function mark(status, key, size) {
  const box = div().relative().flex_none().w(size).h(size);
  const odd = hash(key) % 2 === 1;
  const ink = (name) => div().absolute().left(0).top(0).w(size).h(size).child(svg(`${ART}/${name}.svg`).size(size).text_color(C.mark));
  // Working: the wet stroke keeps turning, a brush still circling.
  // Drawn smaller than the still marks: a moving thing reads larger than it is.
  if (status === "working") {
    const w = Math.round(size * 0.72);
    const off = (size - w) / 2;
    return box.child(div().absolute().left(off).top(off).w(w).h(w).child(svg(`${ART}/${odd ? "work-b" : "work-a"}.svg`).size(w).text_color(C.mark).spin(3200)));
  }
  if (status === "done") {
    const s = Math.round(size * 0.3);
    return box.child(ink("done")).child(art("seal-done", s, s, { x: size - s, y: size - s }));
  }
  if (status === "idle") return box.child(ink(odd ? "idle-b" : "idle-a"));
  // A plain shell: one small dab of ink.
  return box.child(div().absolute().left(size / 2 - 3).top(size / 2 - 3).w(6).h(6).rounded(3).bg(C.faint));
}

function since(ms) {
  if (!ms) return "";
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return "";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function tabLabel(t, all) {
  if (t.named) return t.name;
  const mine = all.filter((p) => p.tab === t.id);
  const p = mine.find((x) => x.status) ?? mine[0];
  const title = String(p?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
  return title || p?.program?.name || `tab ${t.index}`;
}

// ---- the corner branch, petals, fireflies and stars ---------------------------
// A petal is one glyph of text. Its frames add a line at a time, so it steps down
// the whole height of the paper and sways by leading spaces; the glyph changes as
// it falls, so it turns over. Empty frames are the wait before the next one.
// Frames only run forward, which a loop cannot do.

const STEP = 2; // px a petal falls per frame
const TURN = ["⬬", "⬬", "⬮", "⬮", "⬬", "•"]; // face on, turning, edge on
const PETALS = [
  // across the paper (0..1), ms per frame, frames of waiting, where in its cycle it starts (0..1), size, colour
  [0.08, 58, 70, 0.0, 11, "#e8553cd8"],
  [0.2, 92, 150, 0.7, 6, "#b9604f80"],
  [0.34, 74, 120, 0.45, 9, "#e0452dc0"],
  [0.5, 54, 95, 0.8, 12, "#ef6a50dc"],
  [0.62, 98, 170, 0.15, 6, "#b9604f78"],
  [0.74, 80, 140, 0.3, 8, "#d9503aa8"],
  [0.9, 64, 110, 0.6, 10, "#e8553cd0"],
];
const fallFrames = new Map();

function petalFrames(steps, wait, sway, start) {
  const key = `${steps}:${wait}:${sway}:${start}`;
  if (!fallFrames.has(key)) {
    const list = [];
    for (let i = 0; i < steps; i++) {
      const lean = Math.max(0, Math.round(7 + 5 * Math.sin(i / 34 + sway) + 2 * Math.sin(i / 9 + sway * 3)));
      list.push("\n".repeat(i) + " ".repeat(lean) + TURN[Math.floor(i / 11 + sway) % TURN.length]);
    }
    for (let i = 0; i < wait; i++) list.push("");
    // Each petal starts somewhere else in its fall, so they never line up.
    const cut = Math.floor(list.length * start);
    fallFrames.set(key, [...list.slice(cut), ...list.slice(0, cut)]);
  }
  return fallFrames.get(key);
}

function petals(width, height) {
  // Rounded so a resize drag does not rebuild the frames on every pixel.
  const steps = Math.ceil((Math.ceil(height / 40) * 40) / STEP) + 6;
  return PETALS.map(([at, ms, wait, start, size, colour], i) =>
    div()
      .absolute()
      .left(Math.round(at * (width - 50)) + 4)
      .top(-8)
      .w(50)
      .h(height + 16)
      .overflow_hidden()
      .text_size(size)
      .line_height(`${STEP}px`)
      .text_color(colour)
      .frames(petalFrames(steps, wait, i * 1.9, start), ms),
  );
}

// Fireflies about the branch: each wanders in a small box (two swings of different
// lengths) and its light comes and goes.
const FLIES = [
  // across (0..1), px up from the bottom, wander wide, wander high, ms across, ms up and down, ms of one glow, size
  [0.16, 150, 46, 30, 9200, 6100, 3400, 40],
  [0.44, 96, 60, 38, 11800, 7300, 4600, 48],
  [0.7, 176, 40, 44, 8300, 9700, 2900, 36],
  [0.86, 70, 34, 26, 10400, 5600, 5200, 38],
  [0.3, 236, 52, 34, 12600, 8200, 3900, 30],
  [0.6, 300, 44, 40, 9800, 11300, 6100, 26],
];

function fireflies(width, height) {
  return FLIES.map(([at, up, wide, high, across, rise, glow, size]) =>
    div()
      .absolute()
      .left(Math.round(at * (width - wide - size)))
      .top(Math.round(height - up - high - size))
      .w(wide + size)
      .h(high + size)
      .child(
        div()
          .absolute()
          .top(0)
          .w(size)
          .h(high + size)
          .loop("left", { from: 0, to: wide, period: across })
          .child(
            div()
              .absolute()
              .left(0)
              .w(size)
              .h(size)
              .loop("top", { from: 0, to: high, period: rise })
              .child(div().w(size).h(size).loop("opacity", { from: 0.02, to: 1, period: glow }).child(image(`${ART}/glow.png`).w(size).h(size))),
          ),
      ),
  );
}

// A few stars in a strip of sky, unevenly spaced, each fading at its own pace.
// `seed` moves them about; `deep` is how far across the strip they may sit.
function stars(count, seed, { column = false, deep = 22 } = {}) {
  const dots = [];
  let state = hash(`star-${seed}`) | 1;
  for (let i = 0; i < count; i++) {
    // A small scrambler, so neighbouring stars share nothing.
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    const r = (Math.imul(state ^ (state >>> 12), 0x297a2d39) >>> 0) ^ (state >>> 16);
    const size = 1 + (r % 3 === 0 ? 1 : 0) + (r % 11 === 0 ? 1 : 0);
    const gap = 14 + ((r >>> 7) % 150);
    const by = (r >>> 3) % deep;
    const dot = div().flex_none().w(size).h(size).rounded_full().bg("#e9e2d2").loop("opacity", { from: 0.08, to: 0.75, period: 2600 + ((r >>> 5) % 5200) });
    dots.push(column ? dot.mt(gap).ml(by) : dot.ml(gap).mt(by));
  }
  const strip = column ? v_flex() : h_flex().items_start();
  return strip.absolute().top(0).left(0).size_full().overflow_hidden().children(dots);
}

// Faint, behind what follows it, in the bottom corner. It takes up no room: a box
// of no height holds it, reaching `below` px down past where the box sits (the
// height of whatever comes after it) and the rest upward.
function corner(width, below = null) {
  const w = Math.round(width);
  const h = Math.round(200 * (w / 620));
  // The faintness is in the picture itself.
  if (below === null) return div().relative().flex_none().w(w).h(h).child(art("branch", w, h));
  return div().relative().flex_none().w(w).h(0).child(art("branch", w, h, { x: 0, y: Math.round(below - h) }));
}

// ---- rail ------------------------------------------------------------------

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };

const LIMITS = { five_hour: "this session", seven_day: "this week", seven_day_opus: "opus this week", seven_day_sonnet: "sonnet this week" };
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// The saved file as rows to draw. A limit whose window has already started over is left out.
function readLimits(text) {
  let data = null;
  try {
    data = JSON.parse(text ?? "null");
  } catch {
    return [];
  }
  const now = Date.now();
  return Object.entries(data?.limits ?? {})
    .filter(([, v]) => v && Number.isFinite(v.used_percentage) && (!v.resets_at || v.resets_at * 1000 > now))
    .map(([key, v]) => {
      const at = v.resets_at ? new Date(v.resets_at * 1000) : null;
      const clock = at ? `${two(at.getHours())}:${two(at.getMinutes())}` : "";
      const resets = !at ? "" : at - now < 20 * 3600000 ? clock : `${DAYS[at.getDay()]} ${clock}`;
      return { name: LIMITS[key] ?? key.replace(/_/g, " "), used: Math.round(v.used_percentage), resets };
    });
}

class Rail {
  init(_p, cx) {
    this.width = 300;
    this.height = 680;
    // Only the "12 min" beside a working mark needs the clock.
    cx.timer.every(60000, (cx) => {
      if (agents().some((a) => a.status === "working")) cx.notify();
    });
    // Claude's plan limits, which the Claude Code status line saves to a file.
    this.usage = [];
    const read = (cx) =>
      readTextFile(`${home()}/.claude/usage-limits.json`)
        .then((text) => {
          const next = readLimits(text);
          if (JSON.stringify(next) !== JSON.stringify(this.usage)) {
            this.usage = next;
            cx.notify();
          }
        })
        .catch(() => {});
    read(cx);
    cx.timer.every(30000, read);
  }

  // How much of each Claude limit is used: a pale stroke along a hairline, and when it starts over.
  limits() {
    if (!this.usage.length) return div().flex_none();
    return v_flex()
      .flex_none()
      .pl(28)
      .pr(22)
      .pt(18)
      .pb(20)
      .gap(11)
      .children(
        this.usage.map(({ name, used, resets }) => {
          const colour = used >= 85 ? C.red : C.mark;
          return v_flex()
            .gap(5)
            .child(
              h_flex()
                .items_end()
                .gap(8)
                .child(div().flex_none().font_family(SERIF).italic().text_size(14).text_color(C.soft).child(name))
                .child(div().flex_1())
                .child(div().flex_none().font_family(SANS).text_size(8).text_color(C.pale).child(spaced(`resets ${resets}`)))
                .child(div().flex_none().w(30).text_right().font_family(SERIF).text_size(15).text_color(colour).child(`${used}`)),
            )
            .child(
              div()
                .relative()
                .h(3)
                .child(div().absolute().left(0).top(1).w_full().h(1).bg(C.faint))
                .child(div().absolute().left(0).top(0).w(`${Math.max(1, Math.min(100, used))}%`).h(3).rounded(2).bg(colour)),
            );
        }),
      );
  }

  open(s, t) {
    if (!s.active) run("space.select", { id: s.id });
    run("tab.select", { id: t.id });
  }

  menu(s, t) {
    openOverlay({ mod: "sumi", kind: "popup", width: 210, props: { tab: "tab", target: { id: t.id, space: s.id } } });
  }

  // The one that needs you: the bloom, and its name in large type.
  hero(s, t, all) {
    return own(h_flex())
      .id(`sumi-hero-${t.id}`)
      .flex_none()
      .h(104)
      .pl(18)
      .pr(12)
      .gap(4)
      .items_center()
      .cursor_pointer()
      .on_click(() => this.open(s, t))
      .on_mouse_down("right", () => this.menu(s, t))
      .child(div().relative().flex_none().w(100).h(100).child(art("bloom", 100, 100, { pulse: { from: 0.74, to: 1, period: 2800 } })))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(3)
          .child(div().font_family(SANS).font_weight(700).text_size(9).text_color(C.red).child(spaced("needs you")))
          .child(div().font_family(SERIF).text_size(19).line_height("23px").text_color(C.ink).child(tabLabel(t, all))),
      );
  }

  row(s, t, all) {
    const shown = s.active && t.active;
    const note = t.status === "working" ? since(t.working_since) : "";
    const state = t.status === "working" ? "working" : t.status === "done" ? "done" : "";
    return own(h_flex())
      .id(`sumi-tab-${t.id}`)
      .flex_none()
      .h(40)
      .pl(22)
      .pr(14)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .hover((st) => st.bg(C.hover))
      .on_click(() => this.open(s, t))
      .on_mouse_down("right", () => this.menu(s, t))
      // The tab on screen: a short stroke of ink beside it.
      .child(div().flex_none().w(2).h(20).rounded(1).bg(shown ? C.ink : "#00000000"))
      .child(mark(t.status, t.id, 32))
      .child(div().flex_1().min_w(0).truncate().font_family(SANS).font_weight(shown ? 600 : 500).text_size(14).text_color(shown ? C.ink : s.active ? C.soft : C.pale).child(tabLabel(t, all)))
      .when(Boolean(state), (el) => el.child(div().flex_none().font_family(SANS).font_weight(600).text_size(8).text_color(C.pale).child(spaced(note || state))));
  }

  // A space: its seal and name, then its tabs. The shown space is inked.
  space(s, all) {
    const letter = (s.name.replace(/[^\p{L}\p{N}]/gu, "")[0] ?? "·").toUpperCase();
    const tabs = s.tabs.filter((t) => !t.settled);
    return v_flex()
      .flex_none()
      .pb(10)
      .child(
        own(h_flex())
          .id(`sumi-space-${s.id}`)
          .flex_none()
          .h(36)
          .pl(22)
          .pr(14)
          .gap(10)
          .items_center()
          .cursor_pointer()
          .on_click(() => run("space.select", { id: s.id }))
          .on_mouse_down("right", () => openOverlay({ mod: "sumi", kind: "popup", width: 210, height: 260, props: { tab: "space", target: { id: s.id } } }))
          .child(
            div()
              .relative()
              .flex_none()
              .w(22)
              .h(22)
              .when(s.active, (el) => el.child(art("seal-blank", 22, 22)))
              .when(!s.active, (el) => el.child(div().absolute().left(3).top(3).w(16).h(16).border_1().border_color(C.faint)))
              .child(h_flex().absolute().left(0).top(0).w(22).h(22).items_center().justify_center().font_family(SERIF).text_size(11).text_color(s.active ? "#fbf3e4" : C.pale).child(letter)),
          )
          .child(div().flex_1().min_w(0).truncate().font_family(SERIF).italic().text_size(s.active ? 23 : 19).text_color(s.active ? C.ink : C.pale).child(s.name))
          .child(
            div()
              .id(`sumi-add-${s.id}`)
              .flex_none()
              .text_size(15)
              .text_color(C.faint)
              .hover((st) => st.text_color(C.ink))
              .on_click((_e, cx) => {
                cx.stop_propagation();
                run("tab.new", { space: s.id });
              })
              .child("+"),
          ),
      )
      .children(tabs.map((t) => (t.status === "blocked" ? this.hero(s, t, all) : this.row(s, t, all))));
  }

  render() {
    const w = win() ?? {};
    const all = panes();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));

    return v_flex()
      .id("sumi-rail")
      .relative()
      .size_full()
      .overflow_hidden()
      .font_family(SANS)
      .text_color(C.ink)
      .on_size_change((size, cx) => {
        // The size arrives with the app's zoom in it; what this draws is zoomed again.
        const z = Number(settings()?.zoom) || 1;
        if (Math.abs(size.width / z - this.width) < 1 && Math.abs(size.height / z - this.height) < 1) return;
        this.width = size.width / z;
        this.height = size.height / z;
        cx.notify();
      })
      .child(div().flex_none().h(w.platform === "macos" && !w.fullscreen ? 46 : 18))
      .child(
        v_flex()
          .id("sumi-list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(spaces().map((s) => this.space(s, all)))
          .child(
            own(div())
              .id("sumi-space-new")
              .flex_none()
              .pl(24)
              .py(6)
              .text_size(11)
              .text_color(C.faint)
              .cursor_pointer()
              .hover((st) => st.text_color(C.ink))
              .on_click(() => run("space.new"))
              .child("+ new space"),
          ),
      )
      // Claude's limits at the foot, then fireflies about the branch and petals drifting down the whole sheet.
      // They mean nothing; they are there to be looked at.
      // The branch is drawn before the limits, so they sit on top of it.
      .child(corner(this.width, this.usage.length ? 38 + this.usage.length * 47 - 11 : 0))
      .child(this.limits())
      .children(fireflies(this.width, this.height))
      .children(petals(this.width, this.height));
  }
}

// ---- top: the moon and the time --------------------------------------------

const HOURS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const PARTS = ["", "five past", "ten past", "quarter past", "twenty past", "twenty-five past", "half past", "twenty-five to", "twenty to", "quarter to", "ten to", "five to"];

function timeInWords(d = new Date()) {
  const step = Math.round((d.getHours() * 60 + d.getMinutes()) / 5);
  const part = step % 12;
  const hour = Math.floor(step / 12) + (part > 6 ? 1 : 0);
  const name = HOURS[hour % 12];
  return part === 0 ? `${name} o'clock` : `${PARTS[part]} ${name}`;
}

// 0 is the new moon, 4 the full; the mean lunation from a known new moon.
function moonPhase(d = new Date()) {
  const lunation = 29.530588853;
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const age = ((days % lunation) + lunation) % lunation;
  return Math.round((age / lunation) * 8) % 8;
}

class Top {
  init(_p, cx) {
    this.words = timeInWords();
    cx.timer.every(30000, (cx) => {
      const next = timeInWords();
      if (next !== this.words) {
        this.words = next;
        cx.notify();
      }
    });
  }

  render() {
    return h_flex()
      .relative()
      .size_full()
      .pr(4)
      .items_center()
      .justify_end()
      .child(stars(13, "top", { deep: 38 }))
      .child(
        h_flex()
          .flex_none()
          .gap(9)
          .items_center()
          .child(art(`moon-${moonPhase()}`, 16, 16, { absolute: false }))
          .child(div().flex_none().font_family(SERIF).italic().text_size(14).text_color("#d8cfbc").child(this.words)),
      );
  }
}

// ---- pane header -----------------------------------------------------------

const STATE = { blocked: "waiting on you", working: "working", done: "finished", idle: "idle" };

class Pane {
  button(id, glyph, command, args) {
    return div()
      .id(id)
      .flex_none()
      .w(16)
      .text_size(13)
      .cursor_pointer()
      .text_color(C.slabDim)
      .hover((st) => st.text_color(C.slabText))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(glyph);
  }

  render() {
    const all = panes();
    const p = all.find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    // You answered: the prompt it was waiting on is gone. Your seal stays until the next one.
    if (this.was === "blocked" && p.status && p.status !== "blocked") {
      const d = new Date();
      this.sealed = `${two(d.getHours())}:${two(d.getMinutes())}`;
    }
    if (p.status === "blocked") this.sealed = null;
    this.was = p.status;

    const title = String(p.title || p.program?.name || "shell").replace(/^[^\p{L}\p{N}~/]+/u, "").trim() || "shell";
    const where = [tilde(p.cwd), p.branch].filter(Boolean).join("  ·  ");
    const split = all.filter((x) => x.tab === p.tab).length > 1;
    return h_flex()
      .id(`sumi-pane-${pane}`)
      .relative()
      .size_full()
      .px(18)
      .gap(10)
      .items_center()
      .overflow_hidden()
      .font_family(SANS)
      .font_weight(600)
      .text_size(9)
      .on_click(() => run("pane.focus", { pane }))
      // Among several slabs, the one with the keyboard has a vermilion edge.
      .when(split && p.focused, (el) => el.child(div().absolute().top(0).left(0).w_full().h(1).bg(C.red)))
      .child(div().flex_none().max_w(360).truncate().text_color(p.focused ? C.slabText : C.slabMute).child(spaced(title)))
      .when(Boolean(p.status), (el) =>
        el.child(div().flex_none().text_color(C.slabDim).child("·")).child(
          div()
            .flex_none()
            .text_color(p.status === "blocked" ? C.slabRed : C.slabMute)
            .child(spaced(STATE[p.status] ?? p.status))
            .when(p.status === "blocked", (x) => x.loop("opacity", { from: 0.55, to: 1, period: 1600 })),
        ),
      )
      .when(Boolean(this.sealed), (el) => el.child(art("seal-you", 16, 16, { absolute: false })).child(div().flex_none().text_color(C.slabDim).child(spaced(`answered ${this.sealed}`))))
      .child(div().flex_1().min_w(0))
      .child(div().flex_shrink(1).min_w(0).truncate().text_color(C.slabDim).child(spaced(where)))
      .when(p.focused, (el) =>
        el
          .child(this.button(`sumi-pr-${pane}`, "→", "pane.split", { direction: "right", pane }))
          .child(this.button(`sumi-pd-${pane}`, "↓", "pane.split", { direction: "down", pane }))
          .child(this.button(`sumi-pz-${pane}`, p.zoomed ? "−" : "+", "pane.zoom", { pane }))
          .child(this.button(`sumi-px-${pane}`, "×", "pane.close", { pane })),
      );
  }
}

class Blank {
  render() {
    // Bare paper, with a few stars. The tall margin stacks them; the wide one spreads them.
    return div().relative().size_full().child(stars(5, props()?.stars ?? "edge", { column: props()?.stars === "side" }));
  }
}

// ---- menus: a slip of paper with a list on it -------------------------------
// Herdr's own items (the shipped `menu` mod's), drawn in ink. Props { tab: "pane" |
// "tab" | "space", target }. Up and down move, Enter runs, Esc closes.

const PAPER = "#171614";

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function menuItems(p, git) {
  const tg = p?.target ?? {};
  if (p?.tab === "pane") {
    const all = terminals();
    const term = all.find((t) => t.address === tg.terminal);
    const parent = term?.parent && all.find((t) => t.address === term.parent);
    const toProgram = term?.labels?.["herdr.right-click"] === "program";
    // A terminal shown outside a tab has no pane to split, zoom or close.
    const inTab = panes().some((pane) => pane.pane === tg.pane);
    return [
      ...(inTab
        ? [
            ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
            ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
            ["Zoom", "pane.zoom", { pane: tg.pane }],
          ]
        : []),
      ...(term ? [toProgram ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }] : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }]] : []),
      ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
      ...(inTab ? [["Close pane", "pane.close", { pane: tg.pane }]] : []),
    ];
  }
  if (p?.tab === "tab")
    return [
      ["Rename", "tab.rename", { id: tg.id }],
      ["New tab", "tab.new", { space: tg.space }],
      ["Close", "tab.close", { id: tg.id }],
    ];
  if (p?.tab === "space")
    return [
      ["Rename", "space.rename", { id: tg.id }],
      ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
      ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
      ["Close", "space.close", { id: tg.id }],
    ];
  return [
    ["New space", "space.new", {}],
    ["Keybinds", "app.help", {}],
  ];
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

class Menu {
  init(_p, cx) {
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const tabs = new Set((space?.tabs ?? []).map((c) => c.id));
    const folder = space && (panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i) {
    const it = menuItems(props(), this.git)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
  }

  render() {
    const list = menuItems(this.sample ?? props(), this.git);
    return v_flex()
      .id("sumi-menu")
      .when(this.handle, (el) => el.track_focus(this.handle))
      .w_full()
      .min_h(0)
      .py(8)
      .bg(PAPER)
      .font_family(SANS)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) => {
          const closes = it[1].endsWith(".close") || it[0].startsWith("Remove");
          const on = i === this.at;
          return v_flex()
            .when(i > 0 && (closes || it[1] === "app.help"), (el) => el.child(div().mx(16).my(6).h(1).bg(C.faint)))
            .child(
              h_flex()
                .id(`sumi-mi-${i}`)
                .h(32)
                .pr(14)
                .items_center()
                .cursor_pointer()
                .text_color(on ? C.ink : C.soft)
                .hover((st) => st.text_color(C.ink).bg(C.hover))
                .on_click(() => this.choose(i))
                // The chosen line carries the same vermilion stroke as the shown tab.
                .child(div().flex_none().w(2).h(15).ml(7).mr(11).bg(on ? C.red : "#00000000"))
                .child(div().flex_1().truncate().text_size(13).when(closes, (el) => el.font_family(SERIF).italic().text_size(14)).child(it[0]))
                .child(div().flex_none().text_size(8).text_color(C.pale).child(spaced(shortcut(it[1], it[2])))),
            );
        }),
      );
  }
}

// ---- notifications: a slip of paper with a mark on it ------------------------
// Props { title, body, level, action, overlay }. Press it to run its action; it goes either way.

class Toast {
  render() {
    const p = this.sample ?? props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    const urgent = p.level === "error" || p.level === "warning";
    return h_flex()
      .id("sumi-toast")
      .size_full()
      .pl(14)
      .pr(18)
      .gap(12)
      .items_center()
      .bg(PAPER)
      .font_family(SANS)
      .cursor_pointer()
      .hover((st) => st.bg("#1e1c1a"))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      // What kind of news: the seal for trouble, the closed circle for something finished, a wash otherwise.
      .child(
        div()
          .relative()
          .flex_none()
          .w(30)
          .h(30)
          .child(
            urgent
              ? art("seal-blank", 18, 18, { x: 6, y: 6, pulse: p.level === "error" ? { from: 0.6, to: 1, period: 2400 } : null })
              : div().absolute().left(2).top(2).child(mark(p.level === "success" ? "done" : "idle", `toast-${p.title ?? ""}`, 26)),
          ),
      )
      .child(
        v_flex()
          .flex_1()
          .overflow_hidden()
          .gap(1)
          .child(div().truncate().font_family(SERIF).italic().text_size(15).text_color(urgent ? C.slabRed : C.ink).child(login ? `${login[1]} needs a login: run` : (p.title ?? "")))
          .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(C.soft).child(p.body ?? "")))
          .when(Boolean(login), (el) =>
            el.child(
              h_flex()
                .gap(8)
                .items_center()
                .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(C.soft).child(command))
                .child(
                  div()
                    .id("sumi-toast-copy")
                    .flex_none()
                    .text_size(8)
                    .text_color(C.ink)
                    .cursor_pointer()
                    .on_click((_e, cx) => {
                      cx.stop_propagation();
                      cx.write_to_clipboard(command);
                      this.copied = true;
                      cx.notify();
                    })
                    .child(spaced(this.copied ? "copied" : "copy")),
                ),
            ),
          ),
      );
  }
}

// ---- entry -----------------------------------------------------------------

const ROLES = { rail: Rail, top: Top, pane: Pane, blank: Blank };

export default class Sumi extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    if (pr.role) {
      const R = ROLES[pr.role];
      this.role = R ? new R() : null;
      this.role?.init?.(pr, cx);
      return;
    }
    // Opened over the layout: a right-click menu, or a notification.
    const over = pr.overlay && (pr.tab ? Menu : "title" in pr || "body" in pr || "level" in pr ? Toast : null);
    if (over) {
      this.role = new over();
      this.role.init?.(pr, cx);
      return;
    }
    this.top = new Top();
    this.top.init(pr, cx);
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (props()?.role) return div().child(`sumi: no role "${props().role}"`);
    // The gallery: every mark, a waiting row, the moon's phases and the plum branch, on paper.
    const sample = { id: "s", active: true };
    const fake = (status) => ({ id: `gallery-${status}`, index: 1, name: `${status ?? "shell"} tab`, named: true, active: status === "working", status, working_since: Date.now() - 12 * 60000 });
    const rail = new Rail();
    rail.open = () => {};
    rail.menu = () => {};
    rail.usage = readLimits(JSON.stringify({ limits: { five_hour: { used_percentage: 88, resets_at: Date.now() / 1000 + 7200 }, seven_day: { used_percentage: 46, resets_at: Date.now() / 1000 + 3 * 86400 } } }));
    return v_flex()
      .size_full()
      .w_full()
      .p(16)
      .gap(6)
      .bg("#161513")
      // A menu and three notifications, as they open over the layout.
      .child(
        h_flex()
          .flex_none()
          .gap(14)
          .items_start()
          .child(div().flex_none().w(210).border_1().border_color(C.faint).child(Object.assign(new Menu(), { at: 0, git: null, sample: { tab: "tab", target: {} } }).render()))
          .child(
            v_flex()
              .flex_1()
              .gap(8)
              .children(
                [
                  { title: "Claude finished", body: "catalyst · intent to build", level: "success" },
                  { title: "Claude needs you", body: "root · Herdr layout ideas", level: "warning" },
                  { title: "Update installed", body: "Restart to apply", level: "info" },
                ].map((sample) => div().h(58).border_1().border_color(C.faint).child(Object.assign(new Toast(), { sample }).render())),
              ),
          ),
      )
      .child(rail.hero(sample, { ...fake("blocked"), name: "CI improvement" }, []))
      .children(["working", "done", "idle", null].map((st) => rail.row(sample, fake(st), [])))
      .child(h_flex().flex_none().gap(8).p(8).bg("#3a342e").children([0, 1, 2, 3, 4, 5, 6, 7].map((i) => art(`moon-${i}`, 22, 22, { absolute: false }))).child(this.top.render()))
      .child(rail.limits())
      .child(corner(588));
  }
}

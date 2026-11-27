// Horizon: true black, one black hole low in the left rail, and hairline chrome.
// Ember is used for two things only: the tab on screen, and an agent that needs you.
// The sky (stars, dust, the hole's glow) is the layout's background image, painted by
// art/make.html; this mod draws the turning disc, the flat marks and the text over it.
// The layout gives each copy props { role }:
//   rail   every space with its tabs, the hole's clearing, Claude's usage at the foot
//   strip  the shown space's tabs, the date and the time
//   pane   a pane's header on the glass
// A tab's mark: an ember disc that breathes when its agent needs you, a turning arc
// while it works, a closed ring with a dot when it finished, a grey ring when idle,
// a small dot for a plain shell. With no role (herdr-app check, mod.open): a gallery.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, settings, spaces, agents, panes, run, home, setAgentOrder, openOverlay, readTextFile, shared, setShared, layout, window as win } from "herdr";

const ART = "mods/horizon/art";
const DISC = `${ART}/disc-2.webp`; // art/export.sh <n>; a new number each time, the app caches by path
const LABEL = "Futura";
const C = {
  bone: "#ece6d8",
  bone2: "#a8a397",
  bone3: "#847f75",
  bone4: "#45423d",
  bright: "#faf6ec",
  ember: "#ff5b1f",
  line: "#ece6d821",
  line2: "#ece6d838",
  hover: "#ece6d80d",
  none: "#00000000",
};

// Where the hole sits in the sky image (art/hole.js: x, y, outer), and how far its
// light reaches above and below its centre. The rail keeps that band clear.
// `disc` is the circle the sky leaves empty for the turning disc, drawn here.
const SKY = { w: 1512, h: 949, x: 177, y: 706, above: 138, below: 96, disc: 176 };

const spaced = (text) => String(text).toUpperCase().split("").join(" ");
const two = (n) => String(n).padStart(2, "0");
const zoom = () => Number(settings()?.zoom) || 1;

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
}

function label(text, colour = C.bone3, size = 9.5) {
  return div().flex_none().font_family(LABEL).font_weight(500).text_size(size).line_height("12px").text_color(colour).child(spaced(text));
}

// The mark for a status, in a 14px square.
function mark(status) {
  const box = h_flex().flex_none().w(14).h(14).items_center().justify_center();
  if (status === "working") return box.child(svg(`${ART}/working.svg`).size(14).text_color(C.bone).spin(2400));
  if (status === "blocked") return box.child(div().w(9).h(9).rounded_full().bg(C.ember).loop("opacity", { from: 0.45, to: 1, period: 1700 }));
  if (status === "done") return box.child(svg(`${ART}/done.svg`).size(14).text_color(C.bone));
  if (status === "idle") return box.child(svg(`${ART}/idle.svg`).size(14).text_color(C.bone3));
  return box.child(div().w(4).h(4).rounded_full().bg(C.bone3));
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

// A few stars in the clearing about the hole, each fading at its own pace.
// Decoration only: they say nothing.
const STARS = [
  // across (0..1), down (0..1), size, ms of one fade
  [0.1, 0.06, 2, 4300],
  [0.83, 0.12, 1, 6100],
  [0.62, 0.02, 1, 3700],
  [0.92, 0.46, 2, 7400],
  [0.07, 0.6, 1, 5200],
  [0.74, 0.7, 1, 4700],
];

function stars(width, height) {
  return STARS.map(([x, y, size, period]) =>
    div().absolute().left(Math.round(x * width)).top(Math.round(y * height)).w(size).h(size).rounded_full().bg(C.bone).loop("opacity", { from: 0.05, to: 0.7, period }),
  );
}

// A meteor is one glyph of text. Each frame puts it some lines lower and a space
// further left, so it runs down its own slope; empty frames are the wait for the next.
const METEOR = { steps: 20, fall: 14, ms: 22, wait: 1900 };
let meteor = null;
function meteorFrames() {
  if (!meteor) {
    meteor = [];
    for (let i = 0; i < METEOR.steps; i++) meteor.push("\n".repeat((i * METEOR.fall) / 2) + " ".repeat(METEOR.steps - i) + "╱");
    for (let i = 0; i < METEOR.wait; i++) meteor.push("");
  }
  return meteor;
}

// ---- rail ------------------------------------------------------------------

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const LIMITS = { five_hour: "5 hour", seven_day: "7 day", seven_day_opus: "7 day opus", seven_day_sonnet: "7 day sonnet" };

// The file the Claude Code status line saves, as rows. A limit whose window has started over is left out.
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
    .map(([key, v]) => ({ name: LIMITS[key] ?? key.replace(/_/g, " "), used: Math.round(v.used_percentage) }));
}

class Rail {
  init(_p, cx) {
    this.raw = null; // the rail's size as the window measures it (zoom included)
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

  // Where the hole lands in the rail, in the rail's own px, and how many of those one
  // px of the sky image is. The sky covers the window from its centre; the strip tells
  // us how wide the rest of the window is.
  hole() {
    const z = zoom();
    const raw = this.raw ?? { width: 272 * z, height: 730 * z };
    // A mod the app docked beside the work area (it does that the first time it sees one) widens the window too.
    const beside = (layout()?.children ?? []).reduce((sum, c) => sum + (c.id !== "sidebar" && c.id !== "work" && !c.hidden ? (Number(c.size?.px) || 0) * z : 0), 0);
    const W = raw.width + beside + (Number(shared("horizon.work")) || (raw.height * SKY.w) / SKY.h - raw.width - beside);
    const H = raw.height;
    const s = Math.max(W / SKY.w, H / SKY.h);
    return { x: ((W - SKY.w * s) / 2 + SKY.x * s) / z, y: ((H - SKY.h * s) / 2 + SKY.y * s) / z, k: s / z, width: raw.width / z, height: H / z };
  }

  // How tall the foot must be so the list stops above the hole's light.
  foot(g) {
    // The hole is off the rail or the window is odd: give the list most of the room.
    if (g.x > g.width) return 150;
    return Math.round(Math.min(g.height * 0.6, Math.max(150, g.height - (g.y - SKY.above * g.k))));
  }

  // Everything that moves about the hole, behind the list. None of it is data.
  //   two fields of stars turning slowly about the hole, the nearer one faster,
  //   seen only in the clearing below the list
  //   the disc's gas going round, the inner rings faster, its light swelling and sinking
  //   now and then, a meteor falling in
  sky(g, foot) {
    if (g.x > g.width) return div();
    // The stars turn only in the clearing, so none drifts behind a tab's name.
    const clear = g.height - foot;
    const above = Math.max(40, foot - (this.usage.length ? 50 + this.usage.length * 39 : 0)); // and none behind the usage rows
    const turn = (name, across, ms, colour) => {
      const d = Math.round(across * g.k);
      return div().absolute().left(Math.round(g.x - d / 2)).top(Math.round(g.y - d / 2 - clear)).w(d).h(d).child(svg(`${ART}/${name}.svg`).size(d).text_color(colour).spin(ms));
    };
    // The disc itself: one loop of its gas going round, as an animated image. Its
    // light also swells and sinks a little.
    const d = Math.round(2 * SKY.disc * g.k);
    const disc = div().absolute().left(Math.round(g.x - d / 2)).top(Math.round(g.y - d / 2)).w(d).h(d).loop("opacity", { from: 0.86, to: 1, period: 7600 }).child(image(DISC).w(d).h(d));
    return div()
      .absolute()
      .left(0)
      .top(0)
      .w_full()
      .h_full()
      .overflow_hidden()
      .child(div().absolute().left(0).top(clear).w_full().h(above).overflow_hidden().child(turn("stars-b", 1500, 800000, "#ece6d890")).child(turn("stars-a", 1500, 360000, "#ece6d8c0")))
      .child(disc)
      .child(
        div()
          .absolute()
          .left(Math.round(g.x - 26))
          .top(Math.round(g.y - 104 * g.k - METEOR.steps * METEOR.fall))
          .w(220)
          .h(METEOR.steps * METEOR.fall + 30)
          .overflow_hidden()
          .text_size(11)
          .line_height("2px")
          .text_color("#faf6ecd0")
          .frames(meteorFrames(), METEOR.ms),
      );
  }

  limits() {
    if (!this.usage.length) return div();
    return v_flex()
      .absolute()
      .left(28)
      .right(28)
      .bottom(26)
      .gap(15)
      .child(label("Claude usage"))
      .children(
        this.usage.map(({ name, used }) => {
          const colour = used >= 85 ? C.ember : C.bone;
          return v_flex()
            .gap(7)
            .child(h_flex().items_end().justify_between().child(label(name, C.bone2)).child(div().flex_none().text_size(11.5).line_height("12px").text_color(colour).child(`${used}%`)))
            .child(
              div()
                .relative()
                .h(5)
                .child(div().absolute().left(0).top(2).w_full().h(1).bg(C.line2))
                .child(
                  h_flex()
                    .absolute()
                    .left(0)
                    .top(0)
                    .w_full()
                    .h(5)
                    .items_center()
                    .child(div().flex_none().w(`${Math.max(0, Math.min(100, used))}%`).h(1).bg(colour))
                    .child(div().flex_none().w(1).h(5).bg(colour)),
                ),
            );
        }),
      );
  }

  row(s, t, all) {
    const shown = s.active && t.active;
    const needs = t.status === "blocked";
    const quiet = !t.status || t.status === "idle";
    return own(h_flex())
      .id(`hz-tab-${t.id}`)
      .flex_none()
      .h(26)
      .pl(28)
      .pr(20)
      .gap(12)
      .items_center()
      .cursor_pointer()
      .hover((st) => st.bg(C.hover))
      .on_click(() => openTab(s, t))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, t);
      })
      .child(mark(t.status))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(shown ? C.ember : needs ? C.bone : quiet ? C.bone3 : C.bone2).child(tabLabel(t, all)))
      .when(needs, (el) => el.child(label("Needs you", C.ember, 8.5)));
  }

  space(s, all) {
    const tabs = s.tabs.filter((t) => !t.settled);
    return v_flex()
      .flex_none()
      .pb(12)
      .child(
        own(h_flex())
          .id(`hz-space-${s.id}`)
          .flex_none()
          .h(28)
          .pl(28)
          .gap(12)
          .items_center()
          .cursor_pointer()
          .on_click(() => run("space.select", { id: s.id }))
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
          })
          .child(label(s.name, s.active ? C.bone : C.bone3).max_w(200).truncate())
          .child(div().flex_1().h(1).bg(C.line)),
      )
      .children(tabs.map((t) => this.row(s, t, all)));
  }

  render() {
    const w = win() ?? {};
    const all = panes();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));
    const lights = w.platform === "macos" && !w.fullscreen;
    const g = this.hole();
    const foot = this.foot(g);

    return v_flex()
      .id("hz-rail")
      .relative()
      .size_full()
      .overflow_hidden()
      .text_color(C.bone)
      .on_size_change((size, cx) => {
        if (this.raw && Math.abs(size.width - this.raw.width) < 1 && Math.abs(size.height - this.raw.height) < 1) return;
        this.raw = { width: size.width, height: size.height };
        cx.notify();
      })
      .child(this.sky(g, foot))
      .child(div().absolute().top(0).right(0).w(1).h_full().bg(C.line))
      .child(h_flex().flex_none().h(lights ? 76 : 52).pl(28).pt(lights ? 30 : 6).items_center().child(label("Herdr", C.bone, 11)))
      .child(
        v_flex()
          .id("hz-list")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(spaces().map((s) => this.space(s, all)))
          .child(
            own(div())
              .id("hz-space-new")
              .flex_none()
              .pl(28)
              .pb(8)
              .cursor_pointer()
              .child(label("+ space", C.bone4).hover((st) => st.text_color(C.bone))
              )
              .on_click(() => run("space.new")),
          ),
      )
      .child(div().relative().flex_none().w_full().h(foot).children(stars(g.width, foot)).child(this.limits()));
  }
}

// ---- strip: the shown space's tabs, the date and the time -------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  tab(s, t, all, room) {
    return own(h_flex())
      .id(`hz-st-${t.id}`)
      .relative()
      .flex_none()
      .h_full()
      .px(18)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .border_r_1()
      .border_color(C.line)
      .hover((st) => st.bg(C.hover))
      .on_click(() => openTab(s, t))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, t);
      })
      .child(mark(t.status))
      .child(div().flex_none().max_w(room).truncate().text_size(12.5).text_color(t.active ? C.ember : C.bone2).child(tabLabel(t, all)))
      .when(t.active, (el) => el.child(div().absolute().left(0).bottom(0).w_full().h(1).bg(C.ember)));
  }

  render() {
    const all = panes();
    const s = spaces().find((x) => x.active);
    const tabs = (s?.tabs ?? []).filter((t) => !t.settled);
    const d = new Date();
    // Every tab stays on the strip: when they would not fit, their names give way evenly.
    const free = (this.width ?? 1240) / zoom() - 44 - 12 - 186;
    const room = Math.max(24, Math.min(200, Math.floor(free / Math.max(1, tabs.length)) - 61));
    return h_flex()
      .id("hz-strip")
      .relative()
      .size_full()
      .overflow_hidden()
      .on_size_change((size, cx) => {
        if (Math.abs((this.width ?? 0) - size.width) >= 1) {
          this.width = size.width;
          cx.notify();
        }
        if (Math.abs((Number(shared("horizon.work")) || 0) - size.width) >= 1) setShared("horizon.work", size.width);
      })
      .child(div().absolute().left(0).bottom(0).w_full().h(1).bg(C.line))
      .child(h_flex().flex_shrink(1).min_w(0).h_full().overflow_hidden().children(tabs.map((t) => this.tab(s, t, all, room))))
      .child(
        own(h_flex())
          .id("hz-tab-new")
          .flex_none()
          .w(44)
          .h_full()
          .items_center()
          .justify_center()
          .cursor_pointer()
          .text_size(15)
          .text_color(C.bone4)
          .hover((st) => st.text_color(C.bone))
          .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
          .child("+"),
      )
      .child(div().flex_1().min_w(12))
      .child(
        h_flex()
          .flex_none()
          .gap(18)
          .pr(26)
          .items_center()
          .child(label(`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`))
          .child(label(this.time, C.bone, 11)),
      );
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
      .w(16)
      .text_size(13)
      .cursor_pointer()
      .text_color(C.bone4)
      .hover((st) => st.text_color(C.bone))
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
    const split = all.filter((x) => x.tab === p.tab).length > 1;
    const name = String(p.program?.name || p.title || "shell").toLowerCase();
    const what = [name, folderName(p.cwd)].filter(Boolean).join("  ·  ");
    return h_flex()
      .id(`hz-pane-${pane}`)
      .relative()
      .size_full()
      .px(22)
      .gap(12)
      .items_center()
      .overflow_hidden()
      .text_size(12)
      .on_click(() => run("pane.focus", { pane }))
      .child(div().absolute().left(0).bottom(0).w_full().h(1).bg(C.line))
      // Among several panes, the one with the keyboard carries the ember line.
      .when(split && p.focused, (el) => el.child(div().absolute().left(0).top(0).w_full().h(1).bg(C.ember)))
      .child(div().flex_shrink(1).min_w(0).truncate().text_color(p.focused ? C.bone2 : C.bone3).child(what))
      .when(p.status === "blocked", (el) => el.child(label("Needs you", C.ember, 8.5).loop("opacity", { from: 0.5, to: 1, period: 1700 })))
      .child(div().flex_1().min_w(0))
      .when(Boolean(p.branch), (el) => el.child(h_flex().flex_none().max_w(320).gap(8).items_center().child(svg(`${ART}/branch.svg`).size(12).text_color(C.bone2)).child(div().truncate().text_color(C.bone2).child(p.branch ?? ""))))
      .when(split && p.focused, (el) =>
        el
          .child(this.button(`hz-pz-${pane}`, p.zoomed ? "−" : "+", "pane.zoom", { pane }))
          .child(this.button(`hz-px-${pane}`, "×", "pane.close", { pane })),
      );
  }
}

// ---- entry -----------------------------------------------------------------

const ROLES = { rail: Rail, strip: Strip, pane: Pane };

export default class Horizon extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    if (R) {
      this.role = new R();
      this.role.init?.(pr, cx);
    }
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (props()?.role) return div().child(`horizon: no role "${props().role}"`);
    // The gallery: every mark as a rail row, and the usage gauges.
    const rail = new Rail();
    rail.usage = [
      { name: "5 hour", used: 41 },
      { name: "7 day", used: 88 },
    ];
    const sample = { id: "s", active: true };
    const fake = (status, i) => ({ id: `gallery-${i}`, index: i + 1, name: `${status ?? "shell"} tab`, named: true, active: i === 1, status });
    return v_flex()
      .size_full()
      .w(300)
      .py(16)
      .bg("#000000")
      .children(["working", "working", "done", "blocked", "idle", null].map((st, i) => rail.row(sample, fake(st, i), [])))
      .child(div().relative().h(130).child(rail.limits()));
  }
}

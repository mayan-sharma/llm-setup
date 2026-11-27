// ASCII: the whole window in 7-bit characters. No lines, icons or images are
// drawn: every rule is a run of "-", every frame is + - | and the pictures are
// text frames (art/make.mjs). Set in JetBrains Mono NL on one 6.6 x 14 px cell.
// The layout gives each copy props { role }:
//   rail   a shell transcript: the HERDR banner, `tree spaces/` (every space as a
//          folder, its tabs as files), an aquarium and Claude's usage
//   strip  the shown space's tabs: the shown one is a box open at the foot
//   pane   a pane's header, a rule with its facts in brackets
//   line   an Emacs mode line in reverse video: where you are, what the agents do
// and it draws the layout's notifications ("toast": "ascii").
// A tab's mark: | / - \ turning while its agent works, a blinking ! when it needs
// you, * when it finished, z when idle, $ for a plain shell. The tab on screen is
// in reverse video.
// With no role (herdr-app check, mod.open): a gallery.

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, settings, spaces, agents, panes, focused, run, home, setAgentOrder, openOverlay, closeOverlay, readTextFile, window as win } from "herdr";
import { SCENES } from "./scenes.js";

const FONT = "JetBrains Mono NL"; // fonts/: no ligatures, or == and || and __ would fuse
const SIZE = 11; // text px
const LH = 14; // one row
const CW = 6.6; // one column at SIZE
const C = {
  hot: "#ffffff",
  bone: "#e8e4d8",
  mid: "#a9a598",
  dim: "#6b6960",
  faint: "#3d3c38",
  ink: "#0b0b0c",
  cyan: "#7fd6e0",
  red: "#ff6b4a",
  green: "#9fd67a",
  yellow: "#e6c35c",
  blue: "#4f6f9c",
  hover: "#e8e4d812",
  none: "#00000000",
};

const two = (n) => String(n).padStart(2, "0");
const zoom = () => Number(settings()?.zoom) || 1;
const rep = (ch, n) => ch.repeat(Math.max(0, Math.floor(n)));

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
}

// One run of characters in one colour. Never wraps, never shrinks.
function t(value, colour = C.mid) {
  return div().flex_none().font_family(FONT).text_size(SIZE).line_height(`${LH}px`).whitespace_nowrap().text_color(colour).child(String(value));
}

// A rule that fills whatever room is left: far more dashes than fit, clipped.
function rule(colour = C.faint, ch = "-") {
  return div().flex_1().min_w(0).h(LH).overflow_hidden().child(t(rep(ch, 400), colour));
}

// Names are cut by the character, so every column stays on the grid.
function cut(value, n) {
  const s = String(value ?? "");
  if (n <= 0) return "";
  return s.length <= n ? s : n <= 2 ? s.slice(0, n) : `${s.slice(0, n - 2)}..`;
}

const STATUS = { working: C.cyan, blocked: C.red, done: C.green, idle: C.dim };

// The one-character mark for a status. `on`: drawn on a reverse-video bar.
function mark(status, on = false) {
  const colour = on ? C.ink : STATUS[status] ?? C.dim;
  if (status === "working") return t("", colour).w(CW).frames(["|", "/", "-", "\\"], 110);
  if (status === "blocked") return t("", on ? C.ink : C.red).w(CW).frames(["!", "!", "!", " "], 260);
  if (status === "done") return t("*", colour);
  if (status === "idle") return t("z", colour);
  return t("$", colour);
}

function tabLabel(tab, all) {
  if (tab.named) return tab.name;
  const mine = all.filter((p) => p.tab === tab.id);
  const p = mine.find((x) => x.status) ?? mine[0];
  const title = String(p?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
  return title || p?.program?.name || `tab ${tab.index}`;
}

function openTab(s, tab) {
  if (!s.active) run("space.select", { id: s.id });
  run("tab.select", { id: tab.id });
}

function tabMenu(s, tab) {
  openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: s.id } } });
}

function tilde(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
}

// ---- rail ------------------------------------------------------------------

// figlet "small"
const BANNER = [" _  _ ___ ___ ___  ___", "| || | __| _ \\   \\| _ \\", "| __ | _||   / |) |   /", "|_||_|___|_|_\\___/|_|_\\"];

// A glint crossing the banner: each frame keeps only the characters on one
// slanted band, drawn bright over the banner; then a long run of empty frames.
const GLINT = (() => {
  const w = Math.max(...BANNER.map((l) => l.length));
  const frames = [];
  for (let k = -2; k < w + BANNER.length + 3; k++)
    frames.push(BANNER.map((line, y) => [...line.padEnd(w)].map((ch, x) => (Math.abs(x + (BANNER.length - 1 - y) - k) <= 1 ? ch : " ")).join("")).join("\n"));
  for (let i = 0; i < 110; i++) frames.push("");
  return frames;
})();

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };
const LIMITS = { five_hour: "5h", seven_day: "7d", seven_day_opus: "op", seven_day_sonnet: "sn" };
const ART_LH = 13;

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
    .map(([key, v]) => ({ name: LIMITS[key] ?? key.slice(0, 2), used: Math.round(v.used_percentage) }));
}

// A scene: its colours stacked, each a text element stepping through its own frames.
function scene(name) {
  const s = SCENES[name];
  if (!s) return div();
  return div()
    .relative()
    .flex_none()
    .w(Math.ceil(s.cols * CW))
    .h(s.rows * ART_LH)
    .children(
      s.layers.map(({ colour, frames }) =>
        div().absolute().left(0).top(0).w(Math.ceil(s.cols * CW)).h(s.rows * ART_LH).overflow_hidden().font_family(FONT).text_size(SIZE).line_height(`${ART_LH}px`).whitespace_nowrap().text_color(C[colour] ?? C.mid).frames(frames, s.ms),
      ),
    );
}

// A faux prompt line: the rail reads as a shell session.
function prompt(command) {
  return h_flex().flex_none().h(LH).child(t("$ ", C.dim)).child(t(command, C.faint));
}

class Rail {
  init(_p, cx) {
    this.width = null; // as the window measures it (zoom included)
    this.height = null;
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

  banner() {
    const w = Math.ceil(23 * CW), h = BANNER.length * ART_LH;
    const face = () => div().absolute().left(0).top(0).w(w).h(h).font_family(FONT).text_size(SIZE).line_height(`${ART_LH}px`).whitespace_nowrap();
    return div().relative().flex_none().w(w).h(h).child(face().text_color(C.mid).child(BANNER.join("\n"))).child(face().text_color(C.hot).frames(GLINT, 55));
  }

  row(s, tab, all, last, cols) {
    const shown = s.active && tab.active;
    const needs = tab.status === "blocked";
    const quiet = !tab.status || tab.status === "idle";
    const colour = shown ? C.ink : needs ? C.red : quiet ? C.dim : C.mid;
    return own(h_flex())
      .id(`as-tab-${tab.id}`)
      .flex_none()
      .h(17)
      .items_center()
      .cursor_pointer()
      .on_click(() => openTab(s, tab))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, tab);
      })
      .child(t(last ? "`-- " : "|-- ", C.faint))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .h(16)
          .items_center()
          .overflow_hidden()
          .when(shown, (el) => el.bg(C.bone))
          .when(!shown, (el) => el.hover((st) => st.bg(C.hover)))
          .child(t(" "))
          .child(mark(tab.status, shown))
          .child(t(` ${cut(tabLabel(tab, all), cols - 8)}`, colour)),
      );
  }

  space(s, all, cols) {
    const tabs = s.tabs.filter((x) => !x.settled);
    const name = cut(s.name, cols - 3);
    const branch = s.branch && name.length + s.branch.length + 6 <= cols ? ` (${s.branch})` : "";
    return v_flex()
      .flex_none()
      .pb(4)
      .child(
        own(h_flex())
          .id(`as-space-${s.id}`)
          .flex_none()
          .h(18)
          .items_center()
          .cursor_pointer()
          .on_click(() => run("space.select", { id: s.id }))
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
          })
          .child(t(`${name}/`, s.active ? C.bone : C.dim))
          .child(t(branch, C.faint)),
      )
      .children(tabs.map((tab, i) => this.row(s, tab, all, i === tabs.length - 1, cols)));
  }

  // Claude's usage: `7d [#####...............]  25%`
  gauges(cols) {
    if (!this.usage.length) return div();
    const cells = Math.max(8, cols - 11);
    return v_flex()
      .flex_none()
      .child(prompt("claude /usage"))
      .children(
        this.usage.slice(0, 3).map(({ name, used }) => {
          const lit = Math.max(used > 0 ? 1 : 0, Math.min(cells, Math.round((used / 100) * cells)));
          const colour = used >= 85 ? C.red : used >= 60 ? C.yellow : C.green;
          return h_flex()
            .flex_none()
            .h(LH)
            .child(t(`${name.padEnd(2)} [`, C.dim))
            .child(t(rep("#", lit), colour))
            .child(t(rep(".", cells - lit), C.faint))
            .child(t("] ", C.dim))
            .child(t(`${String(used).padStart(3)}%`, used >= 85 ? C.red : C.mid));
        }),
      );
  }

  // The picture at the rail's foot: fish, weeds and bubbles. Decoration only.
  art() {
    return v_flex().flex_none().child(prompt("./aquarium")).child(h_flex().flex_none().justify_center().py(4).child(scene("aquarium")));
  }

  render() {
    const w = win() ?? {};
    const all = panes();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));
    const lights = w.platform === "macos" && !w.fullscreen;
    const width = Math.round((this.width ?? 272 * zoom()) / zoom());
    const cols = Math.max(20, Math.floor((width - 14 - 16) / CW));
    const ss = spaces();
    const count = ss.reduce((n, s) => n + s.tabs.filter((x) => !x.settled).length, 0);

    return v_flex()
      .id("as-rail")
      .relative()
      .size_full()
      .overflow_hidden()
      .pl(14)
      .pr(16)
      .on_size_change((size, cx) => {
        if (this.width && Math.abs(size.width - this.width) < 1 && Math.abs(size.height - this.height) < 1) return;
        this.width = size.width;
        this.height = size.height;
        cx.notify();
      })
      // the rail's edge: a column of |, with a + where the strip's rule meets it
      .child(div().absolute().top(0).right(0).w(Math.ceil(CW)).h_full().overflow_hidden().child(t(`|\n|\n+${rep("\n|", 300)}`, C.faint)))
      .child(div().flex_none().h(lights ? 44 : 16))
      .child(this.banner())
      .child(div().flex_none().h(12))
      .child(prompt("tree spaces/"))
      .child(
        v_flex()
          .id("as-list")
          .flex_1()
          .min_h(0)
          .pt(2)
          .overflow_y_scrollbar()
          .children(ss.map((s) => this.space(s, all, cols)))
          .child(t(`${ss.length} space${ss.length === 1 ? "" : "s"}, ${count} tab${count === 1 ? "" : "s"}`, C.faint))
          .child(
            own(h_flex())
              .id("as-space-new")
              .flex_none()
              .h(22)
              .items_center()
              .cursor_pointer()
              .on_click(() => run("space.new"))
              .child(t("$ ", C.dim))
              .child(t("mkdir ", C.dim).hover((st) => st.text_color(C.bone)))
              .child(t("", C.bone).w(CW).frames(["_", "_", " ", " "], 280)),
          ),
      )
      // a short window keeps its list: the picture goes first
      .when(!this.height || this.height / zoom() >= 560, (el) => el.child(this.art()))
      .child(this.gauges(cols))
      .child(div().flex_none().h(10));
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

  // Three rows. The shown tab is a box whose foot is open, so it runs into the
  // pane; the others are names standing on the rule.
  //    .----------.
  //    | / build  |   $ zsh
  //   -'          '------------
  tab(s, tab, all, room) {
    const label = cut(tabLabel(tab, all), room);
    const n = label.length + 4; // the box is n + 2 wide
    const on = tab.active;
    const edge = on ? C.bone : C.faint;
    return own(v_flex())
      .id(`as-st-${tab.id}`)
      .flex_none()
      .cursor_pointer()
      .on_click(() => openTab(s, tab))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(s, tab);
      })
      .child(t(on ? `.${rep("-", n)}.` : " ", edge))
      .child(
        h_flex()
          .flex_none()
          .h(LH)
          .child(t(on ? "| " : "  ", edge))
          .child(mark(tab.status))
          .child(t(` ${label} `, on ? C.bone : tab.status === "blocked" ? C.red : C.dim).when(!on, (el) => el.hover((st) => st.text_color(C.bone))))
          .child(t(on ? "|" : " ", edge)),
      )
      .child(on ? t(`'${rep(" ", n)}'`, edge) : t(rep("-", n + 2), C.faint));
  }

  render() {
    const all = panes();
    const s = spaces().find((x) => x.active);
    const tabs = (s?.tabs ?? []).filter((x) => !x.settled);
    const d = new Date();
    const stamp = ` ${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}  `;
    // Every tab stays on the strip: when they would not fit, their names give way evenly.
    const cols = Math.floor((this.width ?? 1240) / zoom() / CW);
    const free = cols - 1 - 5 - (stamp.length + 7) - 2;
    const room = Math.max(4, Math.min(26, Math.floor(free / Math.max(1, tabs.length)) - 6));
    return h_flex()
      .id("as-strip")
      .size_full()
      .overflow_hidden()
      .items_start()
      .on_size_change((size, cx) => {
        if (Math.abs((this.width ?? 0) - size.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .child(v_flex().flex_none().child(t(" ")).child(t(" ")).child(t("-", C.faint)))
      .children(tabs.map((tab) => this.tab(s, tab, all, room)))
      .child(
        own(v_flex())
          .id("as-tab-new")
          .flex_none()
          .cursor_pointer()
          .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
          .child(t("     "))
          .child(t(" [+] ", C.dim).hover((st) => st.text_color(C.bone)))
          .child(t("-----", C.faint)),
      )
      .child(v_flex().flex_1().min_w(0).child(div().h(LH * 2)).child(h_flex().child(rule())))
      .child(
        v_flex()
          .flex_none()
          .child(t(" "))
          .child(h_flex().flex_none().h(LH).child(t(stamp, C.dim)).child(t(`${this.time}  `, C.bone)))
          .child(t(rep("-", stamp.length + 7), C.faint)),
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
      .cursor_pointer()
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(t(glyph, C.dim).hover((st) => st.text_color(C.bone)));
  }

  // --[ claude  catalyst-core ]-------------------------------( main )--[+][x]--
  render() {
    const all = panes();
    const p = all.find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const split = all.filter((x) => x.tab === p.tab).length > 1;
    const lit = !split || p.focused;
    const edge = split && p.focused ? C.dim : C.faint;
    const name = String(p.program?.name || p.title || "shell").toLowerCase();
    const folder = folderName(p.cwd);
    return h_flex()
      .id(`as-pane-${pane}`)
      .size_full()
      .items_center()
      .overflow_hidden()
      .on_click(() => run("pane.focus", { pane }))
      .child(t("--[ ", edge))
      .child(mark(p.status))
      .child(t(` ${cut(name, 24)}`, lit ? C.bone : C.dim))
      .when(Boolean(folder), (el) => el.child(t(`  ${cut(folder, 28)}`, C.dim)))
      .when(p.status === "blocked", (el) => el.child(t("  << needs you", C.red)))
      .child(t(" ]", edge))
      .child(rule(edge))
      .when(Boolean(p.branch), (el) => el.child(t("( ", edge)).child(t(cut(p.branch, 36), lit ? C.mid : C.dim)).child(t(" )", edge)))
      .child(t("--", edge))
      .when(split && p.focused, (el) =>
        el
          .child(this.button(`as-pz-${pane}`, p.zoomed ? "[-]" : "[+]", "pane.zoom", { pane }))
          .child(this.button(`as-px-${pane}`, "[x]", "pane.close", { pane }))
          .child(t("--", edge)),
      );
  }
}

// ---- mode line -------------------------------------------------------------

class Line {
  chip(label, n, colour) {
    return h_flex().flex_none().h_full().items_center().bg(colour).child(t(` ${label} ${n} `, C.ink));
  }

  // -:**-  root/build   ~/code/app  (main)            run 1  wait 1   ascii  --
  render() {
    const f = focused();
    const all = panes();
    const s = spaces().find((x) => x.active);
    const tab = s?.tabs.find((x) => x.active);
    const p = all.find((x) => x.pane === f?.pane);
    const list = agents();
    const n = (st) => list.filter((a) => a.status === st).length;
    const working = n("working"), blocked = n("blocked"), done = n("done"), idle = n("idle");
    const flag = blocked ? "!!" : working ? "**" : "--";
    return h_flex()
      .id("as-line")
      .size_full()
      .items_center()
      .overflow_hidden()
      .bg(C.bone)
      .child(t(` -:${flag}-  `, C.ink))
      .child(t(s ? `${cut(s.name, 24)}/${tab ? cut(tabLabel(tab, all), 28) : ""}` : "*scratch*", C.ink).font_weight(700))
      .when(Boolean(f?.cwd), (el) => el.child(t(`   ${cut(tilde(f.cwd), 48)}`, "#4a4840")))
      .when(Boolean(p?.branch), (el) => el.child(t(`  (${cut(p.branch, 32)})`, "#4a4840")))
      .child(div().flex_1().min_w(8).h(LH).overflow_hidden().child(t(`  ${rep("-", 400)}`, "#b9b5a8")))
      .when(blocked > 0, (el) => el.child(this.chip("wait", blocked, C.red)))
      .when(working > 0, (el) => el.child(t(`  run ${working}`, C.ink)))
      .when(done > 0, (el) => el.child(t(`  done ${done}`, C.ink)))
      .when(idle > 0, (el) => el.child(t(`  idle ${idle}`, "#4a4840")))
      .child(t("  --  (ASCII)  ", "#4a4840"));
  }
}

// ---- notifications ---------------------------------------------------------

const LEVEL = { error: ["!!", C.red], warning: ["??", C.yellow], success: ["ok", C.green], info: ["::", C.cyan] };

// +--[ ok ]--------------------------+
// | review #639 finished             |
// | root / tab 3                     |
// +----------------------------------+
class Toast {
  render() {
    const p = this.sample ?? props() ?? {};
    const [tag, colour] = LEVEL[p.level] ?? LEVEL.info;
    const side = () => t("|", C.dim);
    const body = (value, tone) =>
      h_flex().flex_none().h(LH).child(side()).child(div().flex_1().min_w(0).h(LH).overflow_hidden().child(t(` ${value}`, tone))).child(side());
    return v_flex()
      .id("as-toast")
      .size_full()
      .justify_center()
      .px(8)
      .bg(C.ink)
      .cursor_pointer()
      .hover((st) => st.bg("#161617"))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        if (p.overlay) closeOverlay(p.overlay);
      })
      .child(h_flex().flex_none().h(LH).child(t("+--[ ", C.dim)).child(t(tag, colour)).child(t(" ]", C.dim)).child(rule(C.dim)).child(t("+", C.dim)))
      .child(body(p.title ?? "", C.bone))
      .when(Boolean(p.body), (el) => el.child(body(p.body, C.mid)))
      .child(h_flex().flex_none().h(LH).child(t("+", C.dim)).child(rule(C.dim)).child(t("+", C.dim)));
  }
}

// ---- entry -----------------------------------------------------------------

const ROLES = { rail: Rail, strip: Strip, pane: Pane, line: Line };
const SAMPLES = [
  { title: "review #639 finished", body: "root / tab 3", level: "success" },
  { title: "intent to build is waiting", body: "needs your answer", level: "error" },
];

export default class Ascii extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role] ?? (pr.overlay && "title" in pr ? Toast : null);
    if (R) {
      this.role = new R();
      this.role.init?.(pr, cx);
    }
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (props()?.role) return div().child(`ascii: no role "${props().role}"`);
    // The gallery: sample notifications, every mark as a rail row, the aquarium and gauges.
    const rail = new Rail();
    rail.usage = [
      { name: "5h", used: 41 },
      { name: "7d", used: 88 },
    ];
    const sample = { id: "s", active: true };
    const fake = (status, i) => ({ id: `gallery-${i}`, index: i + 1, name: `${status ?? "shell"} tab`, named: true, active: i === 1, status });
    const states = ["working", "working", "done", "blocked", "idle", null];
    return v_flex()
      .size_full()
      .w(300)
      .p(14)
      .gap(8)
      .bg(C.ink)
      .children(
        SAMPLES.map((sm) => {
          const toast = new Toast();
          toast.sample = sm;
          return div().flex_none().h(64).child(toast.render());
        }),
      )
      .child(rail.banner())
      .child(v_flex().flex_none().children(states.map((st, i) => rail.row(sample, fake(st, i), [], i === states.length - 1, 36))))
      .child(h_flex().flex_none().gap(12).child(scene("aquarium")))
      .child(rail.gauges(36));
  }
}

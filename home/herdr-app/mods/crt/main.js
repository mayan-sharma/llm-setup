// CRT: a quiet phosphor-green terminal desk, one mod in roles.
// The layout gives each copy props { role }:
//   bar   top line: space name, tabs as channels, agent summary, time
//   side  left monitor: spaces, then agents
//   sys   right monitor: big clock, an agent radar, machine meters
//   pane  a pane's header (the layout's pane header)
// With no role (herdr-app check) it draws every role once.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, spaces, agents, panes, run, exec, home, appHome, checking, setAgentOrder, openOverlay, layout, window as win } from "herdr";

const FONT = "PxPlus IBM VGA 8x16";
const C = {
  hot: "#39ff7a", // lit phosphor
  text: "#8dffb0",
  mid: "#4fbf74",
  dim: "#2f7d4b",
  line: "#143f25",
  ink: "#021006", // text on a lit block
  glass: "#04110a80", // a monitor's face: the scanlines show through
  wash: "#39ff7a14", // the shown row
  amber: "#ffb000",
  red: "#ff5f56",
};

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const two = (n) => String(n).padStart(2, "0");

function tilde(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// A control inside a window-drag block keeps its own presses.
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_mouse_down("right", (_e, cx) => cx.stop_propagation());
}

// An agent status as one character; working spins, blocked blinks, idle is blank.
function mark(status) {
  if (status === "working") return div().flex_none().w(8).text_color(C.amber).frames(["|", "/", "-", "\\"], 140);
  if (status === "blocked") return div().flex_none().w(8).text_color(C.red).child("!").loop("opacity", { from: 0.25, to: 1, period: 700 });
  if (status === "done") return div().flex_none().w(8).text_color(C.hot).child("√");
  return div().flex_none().w(8);
}

// Whether the shown layout has this node hidden (searches the tree).
function layoutHides(id, node = layout()) {
  if (!node || typeof node !== "object") return false;
  if (node.id === id) return Boolean(node.hidden);
  return (node.children ?? []).some((c) => layoutHides(id, c));
}

const heading = (text) => div().flex_none().px(14).pb(6).text_color(C.dim).child(text);

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

// ---- bar ---------------------------------------------------------------

class Bar {
  init(_p, cx) {
    this.stamp = this.read();
    cx.timer.every(10000, (cx) => {
      const next = this.read();
      if (next !== this.stamp) {
        this.stamp = next;
        cx.notify();
      }
    });
  }

  read() {
    const d = new Date();
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  }

  render() {
    const w = win() ?? {};
    const space = spaces().find((s) => s.active);
    const list = agents();
    const blocked = list.filter((a) => a.status === "blocked").length;
    const working = list.filter((a) => a.status === "working").length;
    const done = list.filter((a) => a.status === "done").length;

    const tab = (t) =>
      own(h_flex())
        .id(`crt-tab-${t.id}`)
        .flex_none()
        .h(22)
        .px(8)
        .gap(6)
        .items_center()
        .cursor_pointer()
        .when(t.active, (el) => el.bg(C.hot).text_color(C.ink))
        .when(!t.active, (el) => el.text_color(C.dim).hover((s) => s.text_color(C.text)))
        .on_click(() => run("tab.select", { id: t.id }))
        .on_mouse_down("right", () =>
          openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: t.id, space: space.id } } }),
        )
        .child(div().max_w(220).truncate().child(t.named ? t.name : `CH${two(t.index)}`))
        .when(Boolean(t.status) && t.status !== "idle" && !t.active, (el) => el.child(mark(t.status)));

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
          .child(div().max_w(260).truncate().text_color(C.hot).child((space?.name ?? "no space").toUpperCase())),
      )
      .child(h_flex().flex_shrink(1).min_w(0).gap(2).items_center().overflow_hidden().children((space?.tabs ?? []).map(tab)))
      .child(
        own(div())
          .id("crt-new-tab")
          .flex_none()
          .cursor_pointer()
          .text_color(C.dim)
          .hover((s) => s.text_color(C.hot))
          .on_click(() => run("tab.new", space ? { space: space.id } : {}))
          .child("+"),
      )
      .child(div().flex_1())
      .when(blocked > 0, (el) => el.child(div().flex_none().text_color(C.red).child(`${blocked} BLOCKED`).loop("opacity", { from: 0.3, to: 1, period: 700 })))
      .when(done > 0, (el) => el.child(div().flex_none().text_color(C.hot).child(`${done} DONE`)))
      .when(working > 0, (el) => el.child(div().flex_none().text_color(C.amber).child(`${working} WORKING`)))
      // The big clock is on the system monitor; the bar keeps time only while that is hidden.
      .when(Boolean(layoutHides("crt-right")), (el) => el.child(div().flex_none().text_color(C.mid).child(this.stamp)));
  }
}

// ---- side: spaces, then agents -------------------------------------------

const URGENCY = { blocked: 0, done: 1, working: 2, idle: 3 };

class Side {
  render() {
    const all = spaces();
    const list = [...agents()].sort((a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9));
    setAgentOrder(list.map((a) => a.address));

    const row = (id, n, shown, onClick) =>
      h_flex()
        .id(id)
        .flex_none()
        .h(26)
        .px(14)
        .gap(8)
        .items_center()
        .cursor_pointer()
        .when(shown, (el) => el.bg(C.wash).text_color(C.hot))
        .when(!shown, (el) => el.text_color(C.mid).hover((s) => s.text_color(C.text)))
        .on_click(onClick)
        .child(div().flex_none().text_color(shown ? C.mid : C.line).child(two(n)));

    const space = (s, i) =>
      row(`crt-space-${s.id}`, i + 1, s.active, () => run("space.select", { id: s.id }))
        .child(div().flex_1().min_w(0).truncate().child(s.name))
        .child(mark(s.status));

    const agent = (a, i) =>
      row(`crt-agent-${a.address}`, i + 1, a.focused, () => run("pane.focus", { pane: a.pane }))
        .child(div().flex_1().min_w(0).truncate().child(a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : `${a.space_name}/${a.tab_name}`))
        .child(mark(a.status));

    return monitor(
      this,
      "crt-side",
      v_flex()
        .id("crt-side-list")
        .flex_1()
        .min_h(0)
        .py(14)
        .overflow_y_scrollbar()
        .child(heading("SPACES"))
        .children(all.map(space))
        .child(div().flex_none().h(22))
        .child(heading("AGENTS"))
        .children(list.map(agent))
        .when(list.length === 0, (el) => el.child(div().flex_none().px(14).text_color(C.line).child("none"))),
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

const TRACK = 96;

// A hairline meter. `low`: running out is the problem (battery).
function meter(label, value, low = false) {
  const known = typeof value === "number" && value >= 0;
  const pct = known ? Math.max(0, Math.min(100, value)) : 0;
  const bad = low ? 100 - pct : pct;
  const color = bad >= 90 ? C.red : bad >= 75 ? C.amber : C.mid;
  return h_flex()
    .flex_none()
    .gap(10)
    .items_center()
    .child(div().flex_none().w(28).text_color(C.dim).child(label))
    .child(div().flex_none().w(TRACK).h(3).bg(C.line).child(div().h_full().w(Math.round((pct / 100) * TRACK)).bg(color)))
    .child(div().flex_1().text_color(C.mid).child(known ? String(pct) : "--"));
}

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
    const color = a.status === "blocked" ? C.red : a.status === "working" ? C.amber : a.status === "done" ? C.hot : C.mid;
    return div()
      .id(`crt-blip-${a.address}`)
      .absolute()
      .left(Math.round(mid + r * Math.sin(t) - size / 2))
      .top(Math.round(mid - r * Math.cos(t) - size / 2))
      .w(size)
      .h(size)
      .bg(color)
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

class Sys {
  init(_p, cx) {
    this.time = this.read();
    this.stats = null;
    cx.timer.every(10000, (cx) => {
      const next = this.read();
      if (next !== this.time) {
        this.time = next;
        cx.notify();
      }
    });
    if (checking()) return;
    cx.timer.every(8000, (cx) => this.poll(cx));
    this.poll(cx);
  }

  read() {
    const d = new Date();
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  }

  poll(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("sh", [`${appHome()}/mods/crt/stats.sh`], { timeout: 5000 });
        const s = JSON.parse(r.stdout);
        const next = { cpu: s.cpu, mem: s.mem, disk: s.disk, bat: s.bat };
        if (JSON.stringify(next) !== JSON.stringify(this.stats)) {
          this.stats = next;
          cx.notify();
        }
      } catch (_e) {
        // Keep the last reading.
      }
    });
  }

  render() {
    const s = this.stats ?? {};
    const d = new Date();
    const list = agents();
    const hot = list.filter((a) => a.status !== "idle").length;
    return monitor(
      this,
      "crt-sys",
      v_flex()
        .flex_1()
        .min_h(0)
        .px(19)
        .py(22)
        .overflow_hidden()
        .child(
          v_flex()
            .flex_none()
            .text_size(24)
            .line_height("24px")
            .text_color(C.hot)
            .children(bigText(this.time).map((line) => div().flex_none().whitespace_nowrap().child(line))),
        )
        .child(div().flex_none().pt(12).text_color(C.dim).child(`${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}`))
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
        .child(v_flex().flex_none().gap(8).child(meter("CPU", s.cpu)).child(meter("MEM", s.mem)).child(meter("DSK", s.disk)).child(meter("BAT", s.bat, true))),
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
    return h_flex()
      .id(`crt-pane-${pane}`)
      .size_full()
      .px(14)
      .gap(10)
      .items_center()
      .overflow_hidden()
      .font_family(FONT)
      .text_size(16)
      .on_click(() => run("pane.focus", { pane }))
      .child(mark(p.status))
      .child(div().flex_none().max_w(420).truncate().text_color(p.focused ? C.text : C.dim).child(title))
      .child(div().flex_1().min_w(0).truncate().text_color(C.line).child(dir))
      .child(div().flex_none().text_color(p.focused ? C.dim : C.line).child(String(p.terminal ?? p.mod ?? "").toUpperCase()))
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

// ---- entry -------------------------------------------------------------

const ROLES = { bar: Bar, side: Side, sys: Sys, pane: Pane };

export default class Crt extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    if (pr.role) {
      const R = ROLES[pr.role];
      this.role = R ? new R() : null;
      this.role?.init?.(pr, cx);
      return;
    }
    // No role: every role once, so a check exercises all of them.
    this.gallery = Object.values(ROLES).map((R) => {
      const r = new R();
      r.init?.(pr, cx);
      return r;
    });
  }

  render(cx) {
    if (this.role) return this.role.render(cx);
    if (this.gallery) return v_flex().size_full().gap(8).children(this.gallery.map((r) => div().flex_none().h(160).child(r.render(cx))));
    return div().child(`crt: no role "${props()?.role}"`);
  }
}

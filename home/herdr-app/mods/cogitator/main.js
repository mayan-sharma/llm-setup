// Cogitator: a grimdark gothic data-terminal. One mod, four roles (props.role):
//   bar    - title plate, data-slate tabs, window keys (the layout's draggable top block)
//   rail   - sectors (spaces) and servitors (agents)
//   pane   - pane header; props: { pane, terminal }
//   status - bottom strip: sector, counts, thought for the day, date

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, agents, props, run, theme, home, exec, notify, openOverlay, setAgentOrder, window as win } from "herdr";

const A = "mods/cogitator/";
const DISPLAY = "Cinzel Decorative";
const CLEAR = "#00000000";

const C = {
  ink: "#050805",
  plate: "#0b0d0a",
  plateHi: "#141a11",
  brass: "#d4a82a",
  brassDim: "#5a4819",
  bone: "#e8dfbc",
  boneDim: "#a89c72",
  dim: "#6f6646",
  phosphor: "#39ff6a",
  phosphorDim: "#1f8f3d",
  activeBg: "#0e2a14",
  hover: "#d4a82a1f",
  red: "#ff3b2f",
  lampOff: "#2b2b1d",
};

const WORD = { working: "LABOURING", blocked: "AWAITS ORDERS", done: "RITE COMPLETE", idle: "DORMANT" };

const THOUGHTS = [
  "A CLEAN BUILD IS ITS OWN REWARD",
  "TRUST THE TEST, DOUBT THE ASSUMPTION",
  "IDLE HANDS INVITE REGRESSIONS",
  "THE LOG REMEMBERS WHAT THE MIND FORGETS",
  "AN UNREVIEWED CHANGE IS A DOOR LEFT OPEN",
  "ONLY IN FAILURE IS THE STACK TRACE REVEALED",
  "VIGILANCE IS THE FIRST DEPENDENCY",
  "COMMIT OFTEN, REGRET NOTHING",
  "A SMALL DIFF IS A BLESSED DIFF",
  "HE WHO SKIPS THE HOOKS COURTS RUIN",
];

const ROMAN = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
function roman(n) {
  let out = "";
  for (const [s, v] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  if (cwd === h) return "~";
  return cwd.startsWith(h + "/") || cwd.startsWith(h + "\\") ? "~" + cwd.slice(h.length) : cwd;
}

// The pane a tab speaks for: the focused one, else its agent, else the first.
function lead(all, id) {
  const mine = all.filter((p) => p.tab === id);
  return mine.find((p) => p.focused) ?? mine.find((p) => p.program?.agent) ?? mine[0];
}

// A status lamp: square, lit in the status color; working breathes, blocked flashes.
function lamp(status, t, size = 8) {
  const el = div().flex_none().w(size).h(size).bg(status ? t[status] ?? C.dim : C.lampOff);
  if (status === "working") return el.loop("opacity", { from: 0.3, to: 1, period: 1400 });
  if (status === "blocked") return el.loop("opacity", { from: 0.1, to: 1, period: 600 });
  return el;
}

// A control in the draggable bar keeps its own presses (else they drag the window).
function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_mouse_down("right", (_e, cx) => cx.stop_propagation());
}

function key(id, child, onClick, hot) {
  return own(div())
    .id(id)
    .flex_none()
    .w(28)
    .h(26)
    .flex()
    .items_center()
    .justify_center()
    .border_1()
    .border_color(C.brassDim)
    .bg(C.plateHi)
    .text_color(C.boneDim)
    .text_size(14)
    .cursor_pointer()
    .hover((s) => s.bg(hot ?? C.hover).border_color(hot ?? C.brass).text_color(hot ? "#ffffff" : C.brass))
    .on_click(onClick)
    .child(child);
}

// Opens a STRATEGIUM tab: the four ambient feeds (mods/cogitator-feeds) in a 2x2 split, in random order.
async function deploy() {
  const feeds = ["auspex", "vox", "noosphere", "vitals"].sort(() => Math.random() - 0.5);
  const call = async (name, args) => {
    const r = await exec("herdr-app", ["do", name, ...args]);
    const out = JSON.parse(r.stdout || "{}");
    if (out.error) throw new Error(out.error);
    return out;
  };
  const feed = (f) => ["--mod", "cogitator-feeds", "--props", JSON.stringify({ feed: f })];
  try {
    const a = await call("tab.new", ["--name", "STRATEGIUM", ...feed(feeds[0])]);
    const b = await call("pane.split", ["--pane", a.pane, "--direction", "right", ...feed(feeds[1])]);
    await call("pane.split", ["--pane", a.pane, "--direction", "down", ...feed(feeds[2])]);
    await call("pane.split", ["--pane", b.pane, "--direction", "down", ...feed(feeds[3])]);
  } catch (e) {
    notify({ title: "Strategium failed to deploy", body: String(e?.message ?? e), level: "error" });
  }
}

function rule() {
  return div().flex_1().h(1).bg(C.brassDim);
}

function heading(text, count) {
  return h_flex()
    .flex_none()
    .px(10)
    .pt(12)
    .pb(6)
    .gap(8)
    .items_center()
    .child(div().flex_none().font_family(DISPLAY).text_size(12).text_color(C.brass).child(text))
    .child(rule())
    .child(div().flex_none().text_size(11).text_color(C.dim).child(count));
}

export default class Cogitator extends View {
  init(_props, cx) {
    // The clock and the thought for the day: data, so a slow timer.
    if (props()?.role === "status") cx.timer.every(30000, (cx) => cx.notify());
  }

  render() {
    const role = props()?.role;
    if (role === "bar") return this.bar();
    if (role === "rail") return this.rail();
    if (role === "status") return this.status();
    return this.pane();
  }

  // ── top bar ────────────────────────────────────────────────────────────
  bar() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const all = panes();
    const w = win() ?? {};

    const tab = (c) => {
      const p = lead(all, c.id);
      const name = (c.named ? c.name : p?.title || p?.program?.name || "terminal").toUpperCase();
      return own(h_flex())
        .id(`cg-tab-${c.id}`)
        .flex_shrink(1)
        .w(230)
        .min_w(0)
        .h(32)
        .px(10)
        .gap(8)
        .items_center()
        .border_1()
        .border_t(2)
        .cursor_pointer()
        .text_size(12)
        .when(c.active, (el) => el.bg(C.activeBg).border_color(C.phosphor))
        .when(!c.active, (el) => el.bg(C.plateHi).border_color(C.brassDim).hover((s) => s.bg(C.hover).border_color(C.brass)))
        .on_click(() => run("tab.select", { id: c.id }))
        .on_mouse_down("right", () =>
          openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }),
        )
        .child(div().flex_none().font_family(DISPLAY).text_color(c.active ? C.phosphor : C.brass).child(roman(c.index)))
        .child(div().flex_none().w(1).h(14).bg(c.active ? C.phosphorDim : C.brassDim))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .when(c.active, (el) => el.font_semibold())
            .text_color(c.active ? C.phosphor : C.boneDim)
            .child(name),
        )
        .child(lamp(c.status, t));
    };

    return h_flex()
      .size_full()
      .px(10)
      .gap(10)
      .items_center()
      .bg(C.plate)
      .border_b(2)
      .border_color(C.brass)
      .when(w.platform === "macos" && w.titlebar === "none" && !w.fullscreen, (el) => el.pl(78))
      .child(
        h_flex()
          .flex_none()
          .gap(8)
          .items_center()
          .child(svg(A + "cog.svg").size(24).flex_none().text_color(C.brass))
          .child(div().font_family(DISPLAY).text_size(17).text_color(C.brass).child("COGITATOR"))
          .child(div().text_size(10).text_color(C.dim).child("MK·VII")),
      )
      .child(div().flex_none().w(1).h(24).bg(C.brassDim))
      .when(Boolean(space), (el) =>
        el.child(h_flex().flex_shrink(1).min_w(0).gap(4).items_center().children(space.tabs.map(tab))),
      )
      .child(key("cg-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(div().flex_1())
      .child(key("cg-strat", "◈", (_e, cx) => cx.spawn(() => deploy())))
      .child(key("cg-rites", "≡", () => run("app.palette")))
      .when(Boolean(w.buttons), (el) =>
        el
          .child(key("cg-min", svg(A + "win-min.svg").size(14), () => run("window.minimize")))
          .child(key("cg-max", svg(A + (w.maximized ? "win-restore.svg" : "win-max.svg")).size(14), () => run("window.maximize")))
          .child(key("cg-close", svg(A + "win-close.svg").size(14), () => run("window.close"), C.red)),
      );
  }

  // ── left rail ──────────────────────────────────────────────────────────
  rail() {
    const t = theme();
    const list = spaces();
    const ag = agents();
    setAgentOrder(ag.map((a) => a.address));

    const sector = (s, i) =>
      h_flex()
        .id(`cg-sp-${s.id}`)
        .flex_none()
        .h(28)
        .pl(8)
        .pr(10)
        .gap(8)
        .items_center()
        .cursor_pointer()
        .border_l(3)
        .border_color(s.active ? C.phosphor : CLEAR)
        .when(s.active, (el) => el.bg(C.activeBg))
        .when(!s.active, (el) => el.hover((st) => st.bg(C.hover)))
        .on_click(() => run("space.select", { id: s.id }))
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
        })
        .child(div().flex_none().text_color(s.active ? C.phosphor : C.brass).child(String(i + 1).padStart(2, "0")))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .when(s.active, (el) => el.font_semibold())
            .text_color(s.active ? C.phosphor : C.bone)
            .child(s.name.toUpperCase()),
        )
        .when(s.tabs.length > 1, (el) => el.child(div().flex_none().text_color(C.dim).child(`×${s.tabs.length}`)))
        .child(lamp(s.status, t));

    const servitor = (a) =>
      v_flex()
        .id(`cg-ag-${a.address}`)
        .flex_none()
        .pl(8)
        .pr(10)
        .py(5)
        .gap(2)
        .cursor_pointer()
        .border_l(3)
        .border_color(a.focused ? C.phosphor : CLEAR)
        .when(a.focused, (el) => el.bg(C.activeBg))
        .when(!a.focused, (el) => el.hover((st) => st.bg(C.hover)))
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(
          h_flex()
            .gap(8)
            .items_center()
            .child(lamp(a.status, t))
            .child(div().flex_1().min_w(0).truncate().text_color(a.focused ? C.phosphor : C.bone).child((a.program?.name ?? a.app ?? "agent").toUpperCase()))
            .child(div().flex_none().text_size(10).text_color(a.status === "idle" ? C.dim : t[a.status] ?? C.dim).child(WORD[a.status] ?? "")),
        )
        .child(div().pl(16).truncate().text_size(11).text_color(C.dim).child(`${a.space_name} / ${a.tab_name}`));

    return v_flex()
      .size_full()
      .bg(C.plate)
      .border_r(1)
      .border_color(C.brassDim)
      .text_size(12)
      .child(
        v_flex()
          .id("cg-rail-scroll")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .child(heading("SECTORS", String(list.length).padStart(2, "0")))
          .children(list.map(sector))
          .child(
            div()
              .id("cg-sp-new")
              .flex_none()
              .h(26)
              .pl(11)
              .flex()
              .items_center()
              .cursor_pointer()
              .text_color(C.dim)
              .hover((st) => st.text_color(C.brass))
              .on_click(() => run("space.new"))
              .child("+  CLAIM NEW SECTOR"),
          )
          .child(heading("SERVITORS", String(ag.length).padStart(2, "0")))
          .children(ag.map(servitor))
          .when(ag.length === 0, (el) => el.child(div().px(11).text_color(C.dim).child("NONE BOUND"))),
      )
      .child(
        h_flex()
          .flex_none()
          .px(10)
          .py(8)
          .gap(10)
          .items_center()
          .border_t(1)
          .border_color(C.brassDim)
          .child(image(A + "seal.svg").w(26).h(36).flex_none())
          .child(
            v_flex()
              .min_w(0)
              .gap(1)
              .text_size(10)
              .child(div().truncate().text_color(C.boneDim).child("SEALED AND SANCTIONED"))
              .child(div().truncate().text_color(C.dim).child("THE MACHINE ENDURES")),
          ),
      );
  }

  // ── pane header ────────────────────────────────────────────────────────
  button(id, icon, command, args, hot) {
    return div()
      .id(id)
      .flex_none()
      .p(4)
      .text_color(C.dim)
      .cursor_pointer()
      .hover((s) => s.bg(hot ?? C.hover).text_color(hot ? "#ffffff" : C.brass))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  pane() {
    const t = theme();
    const p = panes().find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const g = p.program;
    const on = p.focused;
    const where = folder(p.cwd);
    const title = p.mod === "cogitator-feeds" ? "strategium feed" : p.title || g?.name || "shell";
    const dir = where && !title.includes(where) ? where : "";
    return h_flex()
      .id(`cg-head-${pane}`)
      .size_full()
      .pl(10)
      .pr(6)
      .gap(8)
      .items_center()
      .text_size(12)
      .bg(on ? C.activeBg : C.plate)
      .border_b(1)
      .border_color(on ? C.phosphorDim : C.brassDim)
      .on_click(() => run("pane.focus", { pane }))
      .child(div().flex_none().text_color(on ? C.phosphor : C.dim).child(on ? "▶" : "▷"))
      .when(Boolean(g?.icon), (el) =>
        el.child(g.tint ? svg(g.icon).size(14).flex_none().text_color(on ? C.phosphor : C.boneDim) : image(g.icon).w(14).h(14).flex_none()),
      )
      .child(
        div()
          .flex_none()
          .max_w(360)
          .truncate()
          .when(on, (el) => el.font_semibold())
          .text_color(on ? C.phosphor : C.boneDim)
          .child(title.toUpperCase()),
      )
      .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(dir))
      .when(Boolean(p.status), (el) =>
        el.child(
          h_flex()
            .flex_none()
            .gap(6)
            .items_center()
            .text_size(10)
            .child(lamp(p.status, t, 7))
            .child(div().text_color(p.status === "idle" ? C.dim : t[p.status] ?? C.dim).child(WORD[p.status] ?? "")),
        ),
      )
      .child(div().flex_none().w(1).h(14).bg(C.brassDim))
      .child(this.button(`cg-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
      .child(this.button(`cg-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
      .child(this.button(`cg-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
      .child(this.button(`cg-x-${pane}`, "close", "pane.close", { pane }, C.red));
  }

  // ── bottom strip ───────────────────────────────────────────────────────
  status() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const ag = agents();
    const count = (st) => ag.filter((a) => a.status === st).length;
    const blocked = count("blocked");
    const working = count("working");
    const done = count("done");

    const now = new Date();
    const year = now.getFullYear();
    const frac = Math.min(999, Math.floor(((now - new Date(year, 0, 1)) / (366 * 864e5)) * 1000));
    const stamp = `0 ${String(frac).padStart(3, "0")} ${String(year % 1000).padStart(3, "0")}.M${Math.floor(year / 1000) + 1}`;
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const thought = THOUGHTS[Math.floor(now.getTime() / 600000) % THOUGHTS.length];

    return h_flex()
      .size_full()
      .px(10)
      .gap(14)
      .items_center()
      .bg(C.plate)
      .border_t(1)
      .border_color(C.brass)
      .text_size(11)
      .text_color(C.boneDim)
      .child(div().flex_none().max_w(260).truncate().text_color(C.phosphor).child(`++ SECTOR ${(space?.name ?? "NONE").toUpperCase()} ++`))
      .when(Boolean(space?.branch), (el) => el.child(div().flex_none().max_w(220).truncate().child(`BRANCH ${space.branch}`)))
      .child(div().flex_none().child(`SERVITORS ${String(ag.length).padStart(2, "0")}`))
      .when(working > 0, (el) => el.child(h_flex().flex_none().gap(6).items_center().child(lamp("working", t, 7)).child(div().text_color(t.working).child(`${working} LABOURING`))))
      .when(blocked > 0, (el) => el.child(h_flex().flex_none().gap(6).items_center().child(lamp("blocked", t, 7)).child(div().text_color(t.blocked).child(`${blocked} AWAIT ORDERS`))))
      .when(done > 0, (el) => el.child(h_flex().flex_none().gap(6).items_center().child(lamp("done", t, 7)).child(div().text_color(t.done).child(`${done} COMPLETE`))))
      .child(div().flex_1().min_w(0).truncate().text_center().text_color(C.dim).child(`+++ THOUGHT FOR THE DAY: ${thought} +++`))
      .child(div().flex_none().text_color(C.brass).child(stamp))
      .child(div().flex_none().text_color(C.bone).child(clock))
      .child(
        div()
          .id("cg-status-rites")
          .flex_none()
          .cursor_pointer()
          .text_color(C.dim)
          .hover((s) => s.text_color(C.brass))
          .on_click(() => run("app.palette"))
          .child("≡ RITES"),
      );
  }
}

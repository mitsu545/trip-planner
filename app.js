/* trip-planner MVP（保存なし版）
   - データはブラウザ内（localStorage）に保存
   - 入力は「滞在」「移動」の2つだけ。時刻は自動計算 */

const STAY_OPTS = [15, 30, 45, 60, 90, 120, 150, 180];
const TRAVEL_OPTS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const MODES = { car: "🚗", transit: "🚃", walk: "🚶" };
const MODE_PARAM = { car: "driving", transit: "transit", walk: "walking" };
const KEY = "trip-planner-v1";

// ---------- 状態 ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const newDay = () => ({ id: uid(), start: "09:00", end: "21:00", origin: "宿", items: [] });
const defaultState = () => ({ tripName: "", places: {}, pool: [], days: [newDay()], current: 0 });

let state = load();
function load() {
  try { return Object.assign(defaultState(), JSON.parse(localStorage.getItem(KEY))); }
  catch { return defaultState(); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function commit() { save(); render(); }

// ---------- 時間計算 ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fmtDur = (min) => min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? (min % 60) + "m" : ""}` : `${min}m`;

/** 到着・出発時刻を連鎖計算し、合計とゆったり度も返す */
function calc(day) {
  let t = toMin(day.start);
  const rows = day.items.map((it) => {
    const arrive = t;
    const depart = arrive + it.stay;
    t = depart + it.travel;
    return { ...it, arrive, depart };
  });
  const stay = rows.reduce((s, r) => s + r.stay, 0);
  const travel = rows.reduce((s, r) => s + r.travel, 0);
  const span = Math.max(toMin(day.end) - toMin(day.start), 1);
  const used = stay + travel;
  const free = span - used;
  let verdict, cls = "";
  if (rows.length === 0) verdict = "予定なし";
  else if (free < 0) { verdict = "🏃 時間オーバー"; cls = "warn"; }
  else if (travel / used > 0.5 || free < 30) { verdict = "🏃 詰め込みすぎ"; cls = "warn"; }
  else if (travel / used <= 0.3 && free >= 90) verdict = "🛋️ ゆったり";
  else verdict = "🚶 ちょうどいい";
  return { rows, stay, travel, free, span, verdict, cls, end: t };
}

/** Googleマップの経路URL（APIではなく普通のリンク） */
function routeUrl(from, to, mode) {
  const p = new URLSearchParams({ api: "1", origin: from, destination: to, travelmode: MODE_PARAM[mode] });
  return `https://www.google.com/maps/dir/?${p}`;
}

// ---------- 描画 ----------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const select = (opts, value, onChange, label) => {
  const s = document.createElement("select");
  for (const v of opts) s.append(new Option(label(v), v, false, v === value));
  s.onchange = () => onChange(Number(s.value));
  return s;
};

function render() {
  const day = state.days[state.current];
  $("tripName").value = state.tripName;
  $("dayStart").value = day.start;
  $("dayEnd").value = day.end;
  $("dayOrigin").value = day.origin;
  $("dayTitle").textContent = `${state.current + 1}日目`;
  renderTabs();
  renderMeter(day);
  renderTimeline(day);
  renderPool();
}

function renderTabs() {
  const nav = $("dayTabs");
  nav.replaceChildren();
  state.days.forEach((_, i) => {
    const b = el("button", i === state.current ? "active" : "", `${i + 1}日目`);
    b.onclick = () => { state.current = i; commit(); };
    nav.append(b);
  });
  const add = el("button", "", "＋日");
  add.onclick = () => { state.days.push(newDay()); state.current = state.days.length - 1; commit(); };
  nav.append(add);
  if (state.days.length > 1) {
    const del = el("button", "", "－日");
    del.onclick = () => {
      if (!confirm(`${state.current + 1}日目を削除します。予定は候補箱に戻ります。`)) return;
      const [removed] = state.days.splice(state.current, 1);
      state.pool.push(...removed.items.map((it) => it.placeId));
      state.current = Math.max(0, state.current - 1);
      commit();
    };
    nav.append(del);
  }
}

function renderMeter(day) {
  const c = calc(day);
  const m = $("meter");
  m.replaceChildren();
  const bar = el("div", "bar");
  const pct = (v) => `${Math.min(100, (v / c.span) * 100)}%`;
  bar.append(Object.assign(el("div", "stay"), { style: `width:${pct(c.stay)}` }));
  bar.append(Object.assign(el("div", "travel"), { style: `width:${pct(c.travel)}` }));
  if (c.free < 0) bar.append(Object.assign(el("div", "over"), { style: `width:${pct(-c.free)}` }));
  m.append(bar);
  const sum = el("div", "sum");
  sum.append(el("span", `verdict ${c.cls}`, c.verdict));
  sum.append(el("span", "", `滞在 ${fmtDur(c.stay)} ・ 移動 ${fmtDur(c.travel)} ・ 余白 ${c.free < 0 ? "−" : ""}${fmtDur(Math.abs(c.free))}`));
  m.append(sum);
}

function renderTimeline(day) {
  const c = calc(day);
  const ol = $("timeline");
  ol.replaceChildren();

  // 出発地（ドラッグ対象外）
  const o = el("li", "item origin");
  const oh = el("div", "head");
  oh.append(el("span", "time", day.start), el("span", "name", `${day.origin} を出発`));
  o.append(oh);
  ol.append(o);

  c.rows.forEach((r, i) => {
    const place = state.places[r.placeId] || { name: "？" };
    const li = el("li", "item");
    li.dataset.id = r.placeId;

    // 見出し：到着時刻・名前・削除
    const head = el("div", "head");
    head.append(el("span", "time", fmt(r.arrive)));
    const name = el("span", "name");
    if (place.url) { const a = el("a", "", `${place.name} 🔗`); a.href = place.url; a.target = "_blank"; a.rel = "noopener"; name.append(a); }
    else name.textContent = place.name;
    head.append(name);
    const rm = el("button", "remove", "×");
    rm.title = "候補箱に戻す";
    rm.onclick = () => { day.items.splice(i, 1); state.pool.push(r.placeId); commit(); };
    head.append(rm);
    li.append(head);

    // 滞在時間
    const ctrl = el("div", "ctrl");
    ctrl.append("滞在", select(STAY_OPTS, r.stay, (v) => { day.items[i].stay = v; commit(); }, (v) => fmtDur(v)));
    ctrl.append(el("span", "", `→ ${fmt(r.depart)} 出発`));
    if (r.travel > r.stay) ctrl.append(el("span", "warnmark", "⚠️ 移動＞滞在"));
    li.append(ctrl);
    ol.append(li);

    // 次への移動（最後の場所は出発地＝宿へ戻る）
    const nextName = c.rows[i + 1] ? (state.places[c.rows[i + 1].placeId] || {}).name : day.origin;
    const leg = el("div", "leg");
    leg.append("↓ 移動");
    const modes = el("span", "modes");
    for (const [k, icon] of Object.entries(MODES)) {
      const b = el("button", k === r.mode ? "on" : "", icon);
      b.onclick = () => { day.items[i].mode = k; commit(); };
      modes.append(b);
    }
    leg.append(modes, select(TRAVEL_OPTS, r.travel, (v) => { day.items[i].travel = v; commit(); }, (v) => fmtDur(v)));
    const a = el("a", "", "🗺️ 経路を見る");
    a.href = routeUrl(place.name, nextName, r.mode); a.target = "_blank"; a.rel = "noopener";
    leg.append(a);
    ol.append(leg);
  });

  if (c.rows.length === 0) ol.append(el("li", "empty", "ここに候補をドラッグ"));
  else {
    const endMark = el("li", "item origin");
    const h = el("div", "head");
    h.append(el("span", "time", fmt(c.end)), el("span", "name", `${day.origin} に到着（終了 ${day.end}）`));
    endMark.append(h);
    ol.append(endMark);
  }
}

function renderPool() {
  const ul = $("pool");
  ul.replaceChildren();
  if (state.pool.length === 0) ul.append(el("li", "empty", "行きたい場所を追加してください"));
  state.pool.forEach((pid, i) => {
    const p = state.places[pid];
    if (!p) return;
    const li = el("li");
    li.dataset.id = pid;
    const name = el("span", "name");
    if (p.url) { const a = el("a", "", `${p.name} 🔗`); a.href = p.url; a.target = "_blank"; a.rel = "noopener"; name.append(a); }
    else name.textContent = p.name;
    const add = el("button", "add primary", "＋");
    add.title = "この日に追加";
    add.onclick = () => addToDay(pid);
    const del = el("button", "remove", "×");
    del.title = "候補から削除";
    del.onclick = () => { if (confirm(`「${p.name}」を削除しますか？`)) { state.pool.splice(i, 1); delete state.places[pid]; commit(); } };
    li.append(name, add, del);
    ul.append(li);
  });
}

// ---------- 操作 ----------
function addToDay(pid, index) {
  const day = state.days[state.current];
  const item = { placeId: pid, stay: 60, travel: 30, mode: "car" };
  state.pool = state.pool.filter((x) => x !== pid);
  if (index == null || index > day.items.length) day.items.push(item);
  else day.items.splice(index, 0, item);
  commit();
}

$("addForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("newName").value.trim();
  if (!name) return;
  const url = $("newUrl").value.trim();
  const id = uid();
  state.places[id] = { name, url };
  state.pool.push(id);
  $("newName").value = ""; $("newUrl").value = "";
  commit();
  $("newName").focus();
};
$("tripName").oninput = (e) => { state.tripName = e.target.value; save(); };
$("dayStart").onchange = (e) => { state.days[state.current].start = e.target.value || "09:00"; commit(); };
$("dayEnd").onchange = (e) => { state.days[state.current].end = e.target.value || "21:00"; commit(); };
$("dayOrigin").oninput = (e) => { state.days[state.current].origin = e.target.value || "宿"; save(); };
$("dayOrigin").onblur = render;

// ---------- ドラッグ（SortableJS） ----------
// タイムライン内の並べ替え。移動情報（leg）は場所に付随するので、場所の並びだけ入れ替える
new Sortable($("timeline"), {
  group: "places", draggable: ".item:not(.origin)", handle: ".head", animation: 150,
  // 候補箱 → タイムライン。newIndex は draggable 要素の中での位置＝items の挿入位置
  onAdd: (evt) => addToDay(evt.item.dataset.id, evt.newIndex),
  onEnd: (evt) => {
    if (evt.from !== evt.to) return; // 候補箱への移動は pool 側の onAdd で処理
    const day = state.days[state.current];
    const ids = [...$("timeline").querySelectorAll(".item[data-id]")].map((li) => li.dataset.id);
    day.items = ids.map((id) => day.items.find((it) => it.placeId === id));
    commit();
  },
});
new Sortable($("pool"), {
  group: "places", draggable: "li[data-id]", animation: 150,
  onAdd: (evt) => {
    // タイムライン → 候補箱
    const day = state.days[state.current];
    const pid = evt.item.dataset.id;
    day.items = day.items.filter((it) => it.placeId !== pid);
    state.pool.splice(evt.newIndex, 0, pid);
    commit();
  },
});

render();

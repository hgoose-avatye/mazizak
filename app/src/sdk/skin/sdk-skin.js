/*
 * 만지작 SDK 화면 스킨(애니멀팝 사본, 2026-11-20) — 버스팝 appintoss/normal-skin/sdk-skin.js 복사. 바꾼 것: 랭킹산정 기준 문구(클리어한 레벨 수).
 * SDK 0.38.10: 출석 받음/만료 그림(attendanceGot·attendanceExpired = 한입컷 ic_got·ic_expired 복사)은 SDK 가 아이콘 키로 그린다.
 * 랭킹 방패 시상대(leaderboard.podium:'shield')는 SDK 가 상위 3명을 li.gf-lb-pod 로 그린다 — 아래 시상대·내 순위가 .gf-lb-row 와 함께 읽어
 * 이 스킨의 시상대(.sk-podium = Figma P10-1, 한입컷과 같은 92×135 방패)로 다시 그린다. SDK 방패 SVG·왕관 키·기준 줄은 스킨 예외 때의 대체 화면.
 * SDK 0.38.11(라이브 버스팝·타일팝 스킨과 같은 수정): [누적 미션] 묶음(play_total 줄은 일일 묶음에서 뺀다 · SDK 제목을 스킨 묶음 제목으로) ·
 * 출석 카드 노란 테두리는 지금 받을 수 있을 때만(--att / --gift) · 랭킹 배지 폭은 ResizeObserver 로 계속 잰다(trackRankingWidth).
 * [반복 미션]·[일일 미션] 제목은 이 스킨이 그린다 — createView sectionTitles 는 켜지 않는다(켜면 제목이 두 번).
 * __ASSET_<이름>__ 자리는 src/sdk/skin.ts 가 같은 폴더 webp 주소로 채운다.
 * (원문) 버스팝 전용 — SDK 화면(랭킹 · 일일 미션 · 웰컴 기프트 · 첫 방문 온보딩 · 0.35+ 보상 창 .gf-rx-*)을 Normal 테마 팝업 배치로 다시 짠다. 기준 SDK 0.34.7 마크업.
 * 원본: sachunpop/src/ui/sdk-skin.ts (사천팝 Normal 테마와 같은 배치) — 타입만 지운 JS.
 * SDK(vendor/gf-sdk, 해시 고정)는 카드를 innerHTML 로 통째 다시 그린다. 그때마다 새 카드를 받아 배치만 바꾼다.
 * SDK 의 버튼은 지우지 않고 옮기기만 한다 — 클릭은 SDK 가 data-* 속성으로 위임 처리(동작·서버 호출은 SDK 몫).
 * 셸에는 scripts/inline-normal-skin.mjs 가 이 파일과 normal-skin.css 를 넣는다(직접 셸을 고치지 말 것).
 */
(function () {
const SKIN = "data-skin";
// 선물상자 그림(Figma 아이콘팩 · normal-skin/welcome_gift.webp — inline 스크립트가 data URI 로 채운다). 웰컴·온보딩·미션 창 웰컴 줄 공통
const GIFT = "__ASSET_welcome_gift__";
// 글자 앞 아이콘 = Figma 아이콘팩 그림(사천팝과 같은 그림 — 테마만 다르고 아이콘은 통일)
const IC = {
  point: "__ASSET_ic_point__", coin: "__ASSET_ic_coin__", heart: "__ASSET_ic_heart__", booster: "__ASSET_ic_booster__",
  repeat: "__ASSET_ic_repeat__", remaining: "__ASSET_ic_remaining__",
  completed: "__ASSET_ic_completed__", gift: GIFT,
  mission: "__ASSET_ic_mission__", trophy: "__ASSET_ic_trophy__"
};
// The manual reward renderer uses the same authored game icons. bell = company standard (hanipcut ic_bell.webp) for the notification sheets.
// attendanceGot·attendanceExpired = 한입컷 ic_got·ic_expired(출석 칸 받음·기간만료), crown1~3 = 랭킹 방패 시상대 왕관(이 스킨 시상대와 같은 게임 그림)
window.__gfRewardIcons = Object.assign({}, IC, {
  hearts: IC.heart, check: IC.completed, bell: "__ASSET_ic_bell__",
  attendanceGot: "__ASSET_ic_got__", attendanceExpired: "__ASSET_ic_expired__",
  crown1: "__ASSET_crown_1__", crown2: "__ASSET_crown_2__", crown3: "__ASSET_crown_3__"
});
function icon(kind, cls = "sk-ic") {
  const img = document.createElement("img");
  img.className = cls;
  img.src = IC[kind];
  img.alt = "";
  return img;
}
/* SDK 인라인 SVG 아이콘(hubIcons)을 고유 색으로 알아보고 아이콘팩 그림으로 바꾼다 — 모르는 그림은 그대로 둔다 */
function kindOf(svg) {
  const h = svg.outerHTML;
  // SDK 0.34 미션 칩(멀티 보상)은 색이 다른 새 아이콘을 쓴다 — 둘 다 알아본다
  if (h.includes("#3182f6") || h.includes("#69b5ff")) return "point";
  if (h.includes("#f5b400") || h.includes("#ffd46b")) return "coin";
  if (h.includes("#ff5a6e") || h.includes("#ff8daf")) return "heart";
  if (h.includes("#3cc35a")) return "completed";
  if (h.includes("#ff8a3d")) return "gift";
  if (h.includes('width="18" height="12"')) return "booster";
  return null;
}
function swapIcons(root) {
  for (const svg of root.querySelectorAll(".gf-wel-ico svg, .gf-onb-ico svg, .gf-hub-chip svg")) {
    const k = kindOf(svg);
    if (k) svg.replaceWith(icon(k));
  }
}
/* 게임 화면 상단 랭킹·미션 배지 = Figma "Theme Title Plank"(Normal, 37:20414) — 글자만("랭킹" · "미션"), 미션 진행 수(n/m)는 오른쪽 위 빨간 작은 배지.
   순서는 랭킹 → 미션(UIUX 수정사항 2026-10-27): 랭킹 배지 폭을 --sk-lb-w 로 남기면(trackRankingWidth) CSS 가 미션 배지를 그 오른쪽에 둔다. */
function skinPill(btn, hub) {
  const rest = (btn.textContent || "").replace(/^\S+\s*/, "").trim();
  const label = document.createElement("span");
  label.className = "sk-pill__t";
  const parts = [label];
  if (!hub) label.textContent = "랭킹";
  else if (/^\d+\/\d+$/.test(rest)) {
    label.textContent = "미션";
    const n = document.createElement("span");
    n.className = "sk-pill__n";
    n.textContent = rest;
    parts.push(n);
  } else label.textContent = rest || "미션";
  btn.replaceChildren(...parts);
  btn.classList.add("sk-pill");
}
// 순위 왕관 = Figma 아이콘팩 그림(normal-skin/crown_1~3.webp — inline 스크립트가 data URI 로 채운다)
const CROWN = { 1: "__ASSET_crown_1__", 2: "__ASSET_crown_2__", 3: "__ASSET_crown_3__" };
function crown(rank, cls = "sk-crown") {
  const el2 = document.createElement("span");
  el2.className = cls;
  el2.setAttribute("aria-label", `${rank}\uC704`);
  const img = document.createElement("img");
  img.src = CROWN[rank] || CROWN[3];
  img.alt = "";
  el2.append(img);
  return el2;
}
const el = (tag, cls, kids = []) => {
  const e = document.createElement(tag);
  e.className = cls;
  for (const k of kids) if (k) e.append(k);
  return e;
};
const txt = (node) => {
  var _a;
  return ((_a = node == null ? void 0 : node.textContent) != null ? _a : "").trim();
};
const num = (s) => {
  const m = s.replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]).toLocaleString("ko-KR") : s;
};
function rankOf(row, i) {
  const r = Number(row.getAttribute("data-rank"));
  if (r) return r;
  const b = row.querySelector(".gf-lb-rank b");
  return b ? Number(txt(b)) || i + 1 : i + 1;
}
/* SDK 0.34: 이름은 .gf-lb-name-text, 그 뒤에 "나"(.gf-lb-you)·상승 표식(.gf-lb-up) */
const nameOf = (row) => txt(row.querySelector(".gf-lb-name-text")) || txt(row.querySelector(".gf-lb-name"));
function skinRow(row, rank, crowned) {
  var _a, _b, _c, _d;
  const score = row.querySelector(".gf-lb-score");
  const remove = row.querySelector(".gf-lb-remove");
  (_a = row.querySelector(".gf-lb-rank")) == null ? void 0 : _a.remove();
  (_b = row.querySelector(".gf-lb-avatar")) == null ? void 0 : _b.remove();
  (_c = row.querySelector(".gf-lb-crown")) == null ? void 0 : _c.remove();
  if (score) {
    const n = num(txt(score));
    score.textContent = n === "0" ? "기록 없음" : n;
    score.classList.toggle("sk-none", n === "0");
  }
  row.prepend(crowned && rank <= 3 ? crown(rank, "sk-crown sk-crown--row") : el("span", "sk-rank", [String(rank)]));
  // 친구 삭제 = Theme Round Button(x-bold, 작은 크기)
  if (remove) { remove.classList.add("sk-del"); row.append(remove); }
}
function podium(rows) {
  const order = [2, 1, 3];
  const byRank = new Map(rows.map((r, i) => [rankOf(r, i), r]));
  const cards = order.filter((r) => byRank.has(r)).map((r) => {
    var _a;
    const row = byRank.get(r);
    const me = row.classList.contains("me");
    const avatar = (_a = row.querySelector(".gf-lb-avatar")) != null ? _a : el("span", "gf-lb-avatar", [el("i", "", ["?"])]);
    const name = el("span", "sk-pod__name", [nameOf(row)]);
    const you = row.querySelector(".gf-lb-you");
    if (you) name.append(el("i", "sk-pod__you", [txt(you)]));
    // 깃발 모양(채움 + 안쪽 테두리 + 그림자)은 따로 한 겹 — 그림자가 글자·아바타에 번지지 않게
    const shape = el("span", "sk-pod__shape", [el("i", "sk-pod__fill"), el("i", "sk-pod__line")]);
    return el("div", `sk-pod sk-pod--${r}${me ? " sk-pod--me" : ""}`, [
      shape,
      el("span", "sk-pod__face", [avatar, crown(r, "sk-crown sk-crown--pod")]),
      name,
      el("span", "sk-pod__score", [num(txt(row.querySelector(".gf-lb-score")))])
    ]);
  });
  return el("div", "sk-podium", cards);
}
/* 내 순위 바 — SDK 0.34 의 "내 닉네임" 줄(닉네임·순위·수정)과 목록 밖일 때의 요약(.gf-lb-mine)을 한 줄로 */
function myBar(card, meRow) {
  var _a, _b;
  const mine = txt(card.querySelector(".gf-lb-mine"));
  const nickRank = txt(card.querySelector(".gf-lb-nickrank"));
  const rank = (meRow ? rankOf(meRow, 0) : 0) || Number((_a = (nickRank || mine).match(/(\d+)\s*위/)) == null ? void 0 : _a[1]) || null;
  const scoreTxt = meRow ? txt(meRow.querySelector(".gf-lb-score")) : (_b = mine.match(/·\s*([\d,]+)/)) == null ? void 0 : _b[1];
  const nickEl = card.querySelector(".gf-lb-nickval");
  const nick = nickEl && !nickEl.classList.contains("unset") ? txt(nickEl) : meRow ? nameOf(meRow) : "";
  const pencil = el("button", "sk-mine__edit sk-edit");
  pencil.setAttribute("data-nick-edit", "");
  pencil.setAttribute("aria-label", "닉네임 변경");
  return el("div", "sk-mine", [
    el("b", "sk-mine__rank", [rank ? String(rank) : "-"]),
    el("span", "sk-mine__who", [el("small", "", ["내 순위"]), el("span", "", [nick || "미설정"])]),
    scoreTxt ? el("span", "sk-mine__score", [num(scoreTxt)]) : null,
    pencil
  ]);
}
function skinNickEdit(card, head) {
  var _a;
  const input = card.querySelector("[data-nick-input]");
  const save = card.querySelector("[data-nick-save]");
  const cancel = card.querySelector("[data-nick-cancel]");
  const hint = txt(card.querySelector(".gf-lb-nickhint"));
  if (!input || !save || !cancel) return;
  (_a = head == null ? void 0 : head.querySelector(".gf-lb-title")) == null ? void 0 : _a.replaceChildren("\uB2C9\uB124\uC784 \uBCC0\uACBD");
  input.maxLength = 12;
  if (input.value.length > 12) input.value = input.value.slice(0, 12);
  input.placeholder = "\uB2C9\uB124\uC784\uC744 \uC785\uB825\uD558\uC138\uC694";
  const count = el("span", "sk-nick__count", [`${input.value.length}/12`]);
  input.addEventListener("input", () => {
    count.textContent = `${input.value.length}/12`;
  });
  save.textContent = "\uBCC0\uACBD\uD558\uAE30";
  cancel.textContent = "\uCDE8\uC18C";
  const well = el("div", "sk-well", [
    el("div", "sk-nick", [el("label", "sk-nick__box", [input, count]), el("p", "sk-nick__hint", [hint || "\uCD5C\uB300 12\uC790\uAE4C\uC9C0 \uC4F8 \uC218 \uC788\uC5B4\uC694"])]),
    el("div", "sk-two", [cancel, save])
  ]);
  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add("sk-lb--nick");
  try {
    input.focus();
  } catch (e) {
  }
}
function skinLeaderboard(card) {
  const head = card.querySelector(".gf-lb-head");
  const title = head == null ? void 0 : head.querySelector(".gf-lb-title");
  if (title) title.textContent = "랭킹";
  if (card.querySelector(".gf-lb-nickbar.editing")) {
    skinNickEdit(card, head);
    return;
  }
  const tabs = card.querySelector(".gf-lb-tabs");
  const friends = !!card.querySelector('[data-tab="friends"].active');
  const banner = card.querySelector(".gf-lb-rankup");
  const pod = card.querySelector(".gf-lb-podium");
  const list = card.querySelector(".gf-lb-list");
  const empty = card.querySelector(".gf-lb-empty");
  const invite = card.querySelector("[data-invite]");
  const retry = card.querySelector("[data-retry]");
  const meRow = card.querySelector(".gf-lb-row.me, .gf-lb-pod.me");
  /* Figma P10-1·P10-2·P10-3(Normal): 스크롤[탭 → (전체) 시상대 → 카드((친구) + 친구 추가하기 · 목록|빈 안내)] → 내 순위 → 산정 기준 */
  // 2026-10-27 사용자 확정: 탭 · 시상대는 고정, 목록 카드(친구 추가하기 + 목록)만 스크롤
  const well = el("div", "sk-well", [banner, tabs]);
  const scroll = el("div", "sk-scroll", []);
  if (invite) {
    invite.className = "sk-invite";
    invite.textContent = "+ 친구 추가하기"; // Figma: 아이콘 없이 글자만
  }
  // UI/UX 수정안(2026-10-27): 머리줄과 아래(내 순위 + 산정 기준)만 고정, 탭부터 목록 카드 끝까지 한 덩어리로 스크롤(높이 가변).
  // 창 높이는 탭과 무관하게 같다(CSS .sk-lb height) — 친구 0명이어도 전체/친구 전환 때 흔들리지 않는다.
  const panel = el("div", "sk-panel", [friends && invite ? el("div", "sk-panel__add", [invite]) : null]);
  const note = () => el("p", "sk-lb-note", ["랭킹산정 기준: 클리어한 레벨 수 순"]);
  if (pod || list) {
    // 기본 시상대 = .gf-lb-row 세 줄, 방패 시상대(0.38.10 podium:'shield') = li.gf-lb-pod(빈 칸 .empty 는 뺀다) — 같은 필드(data-rank·아바타·이름·점수)
    const top = pod ? [...pod.querySelectorAll(".gf-lb-row, .gf-lb-pod:not(.empty)")] : [];
    if (top.length) well.append(podium(top));
    const rows = list ? [...list.querySelectorAll(".gf-lb-row")] : [];
    rows.forEach((r, i) => skinRow(r, rankOf(r, i), false));
    if (list) panel.append(list);
    scroll.append(panel);
    well.append(scroll, myBar(card, meRow), note());
  } else if (empty) {
    const msg = retry ? [...empty.querySelectorAll("p")].map((p) => p.cloneNode(true)) : [el("p", "", ["친구를 초대하면", el("br", ""), "여기서 함께 순위를 볼 수 있어요"])];
    if (retry) retry.className = "sk-invite";
    panel.append(el("div", "sk-empty", [...msg, retry]));
    scroll.append(panel);
    well.append(scroll);
    if (!retry) well.append(myBar(card, null), note());
  }
  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add("sk-lb");
}
const STATUS = [
  ["done", "\uC644\uB8CC", "sk-st--done"],
  ["checking", "\uD655\uC778 \uC911", "sk-st--wait"],
  ["failed", "\uD655\uC778 \uC911", "sk-st--wait"],
  ["auto", "\uC790\uB3D9 \uC9C0\uAE09", "sk-st--wait"],
  ["progress", "\uC9C4\uD589 \uC911", "sk-st--go"]
];
function skinMissionRow(row) {
  var _a, _b, _c;
  const name = row.querySelector(".gf-hub-name");
  const bar = row.querySelector(".gf-hub-bar");
  const count = row.querySelector(".gf-hub-count");
  const note = row.querySelector(".gf-hub-note");
  const chip = row.querySelector(".gf-hub-chip");
  (_a = row.querySelector(".gf-hub-ico")) == null ? void 0 : _a.remove();
  (_b = row.querySelector(".gf-hub-ribbon")) == null ? void 0 : _b.remove();
  const st = (_c = STATUS.find(([k]) => row.classList.contains(k))) != null ? _c : STATUS[STATUS.length - 1];
  if (chip) {
    const b = chip.querySelector("b");
    if (b) b.textContent = txt(b).replace(/받음\s*✓?/, "받음");
  }
  const sub = el("div", "sk-ms__sub", [[txt(count), txt(note)].filter(Boolean).join(" \xB7 ")]);
  count == null ? void 0 : count.remove();
  note == null ? void 0 : note.remove();
  // 줄 안의 SDK 버튼(예: 알림 받기 동의 [data-notify-consent])은 지우지 않고 상태 자리에 둔다 — 클릭은 SDK 가 처리
  const actions = [...row.querySelectorAll("button")];
  actions.forEach((btn) => btn.classList.add("sk-st", "sk-st--act"));
  const body = el("div", "sk-ms__body", [el("div", "sk-ms__title", [name, chip]), bar, sub]);
  row.replaceChildren(body, ...(actions.length ? actions : [el("span", `sk-st ${st[2]}`, [st[1]])]));
}
/* SDK 0.34: 맨 위 보너스(.gf-hub-hero 안 .gf-hub-summary + 보상 칸) · 묶음별 목록(.gf-hub-section: 무한 반복 / 남은 미션 / 오늘 완료) · 아래(.gf-hub-foot) */
function skinSummary(summary) {
  const t = summary.querySelector(".gf-hub-summary-t");
  const bar = summary.querySelector(".gf-hub-bar");
  const total = summary.querySelector(".gf-hub-total");
  const prize = summary.querySelector(".gf-hub-bonus-prize");
  const chip = prize == null ? void 0 : prize.querySelector(".gf-hub-chip");
  const label = prize == null ? void 0 : prize.querySelector(":scope > span:not(.gf-hub-chip)");
  const reward = chip ? el("span", "sk-sum__prize", [txt(label), chip]) : null;
  return el("div", "sk-sum", [t, bar, el("div", "sk-sum__row", [total, reward])]);
}
function skinHub(card) {
  const head = card.querySelector(".gf-hub-head");
  // 게스트 카드(온보딩)는 머리줄이 .gf-title + .gf-close-x 다
  const title = head == null ? void 0 : head.querySelector(".gf-hub-title, .gf-title");
  if (title) { title.textContent = "오늘의 미션"; title.classList.add("gf-hub-title"); }
  const gx = head == null ? void 0 : head.querySelector(".gf-close-x");
  if (gx) gx.classList.add("gf-hub-x");
  const summary = card.querySelector(".gf-hub-summary");
  const sections = [...card.querySelectorAll(".gf-hub-section")];
  const foots = [...card.querySelectorAll(".gf-hub-foot")];
  const well = el("div", "sk-well", [summary ? skinSummary(summary) : null]);
  for (const sec of sections) {
    const list = sec.querySelector(".gf-hub-list");
    const label = sec.querySelector(".gf-hub-section-label");
    const h = sec.querySelector("h3");
    const countEl = h ? [...h.children].find((c) => c !== label) : null;
    const cls = ["repeat", "remaining", "completed", "welcome"].find((k) => sec.classList.contains(k)) || "";
    const secIc = { repeat: "repeat", remaining: "remaining", completed: "completed", welcome: "gift" }[cls];
    well.append(el("div", `sk-sec sk-sec--${cls}`, [el("b", "", [secIc ? icon(secIc, "sk-ic sk-ic--sec") : null, txt(label) || txt(h)]), countEl ? el("span", "", [txt(countEl)]) : null]));
    if (list) {
      list.querySelectorAll(".gf-hub-row").forEach(skinMissionRow);
      well.append(list);
      continue;
    }
    // 목록 없는 묶음(웰컴 기프트 줄 · 게스트 안내 문구)은 내용을 그대로 옮긴다 — 받기 버튼([data-onb-claim])은 SDK 가 처리
    for (const art of sec.querySelectorAll(".gf-onb-hubart")) art.src = GIFT;
    for (const c of [...sec.children]) if (c !== h) well.append(c);
  }
  for (const f of foots) well.append(f);
  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add("sk-hub");
}
function skinWelcome(card) {
  const x = card.querySelector(".gf-wel-x");
  const gift = card.querySelector(".gf-wel-gift");
  const title = card.querySelector(".gf-wel-title");
  const sub = card.querySelector(".gf-wel-sub");
  const chips = card.querySelector(".gf-wel-chips");
  const cta = card.querySelector(".gf-wel-cta");
  if (gift) {
    const img = document.createElement("img");
    img.src = GIFT;
    img.alt = "";
    gift.replaceChildren(img);
  }
  const head = el("div", "sk-wel-head", [el("h2", "sk-wel-title", ["\uBCF4\uC0C1 \uBC1B\uAE30"]), x]);
  const info = el("div", "info-card sk-wel-info", [gift, title, sub, chips]);
  card.replaceChildren(head, el("div", "sk-well", [info, cta]));
  card.classList.add("sk-wel");
}
/* 첫 방문 온보딩(SDK 0.34 · ③ 예고 ④ 첫 판 성공 ⑤ 로그인 필요 · 받는 중 ⑦ 결과 ⑧ 다음에): 웰컴 기프트와 같은 보상 받기(P12) 배치 */
function skinOnboarding(card) {
  const label = card.getAttribute("aria-label") || "";
  const x = card.querySelector(".gf-onb-x");
  const art = card.querySelector(".gf-onb-mascot");
  const title = card.querySelector(".gf-onb-title");
  const chips = card.querySelector(".gf-onb-chips");
  const sub = card.querySelector(".gf-onb-sub");
  const spin = card.querySelector(".gf-onb-spin");
  const cta = card.querySelector(".gf-onb-cta");
  if (art) { art.src = GIFT; art.className = "sk-onb-art"; }
  const head = el("div", "sk-wel-head", [el("h2", "sk-wel-title", [/로그인/.test(label) ? "토스 로그인" : "웰컴 기프트"]), x]);
  const info = el("div", "info-card sk-onb-info", [art, title, chips, sub, spin]);
  card.replaceChildren(head, el("div", "sk-well", [info, cta]));
  card.classList.add("sk-wel", "sk-onb");
}
/*
 * SDK 0.35+ 공통 보상 창(.gf-rx-*, reward.createView) — UI/UX 수정안(2026-10-27) Normal 배치.
 * SDK 는 창을 열 때·갱신할 때마다 .gf-rx-back 안을 innerHTML 로 통째 다시 그린다 → 새 .gf-rx-dialog 마다 한 번 손본다.
 * 버튼(data-rx)·줄(data-row)·순서는 그대로 두고 표시(문구 꼬리·묶음 제목·칩)만 더한다 — 클릭은 SDK 위임 처리.
 */
const IC_POINT_L = "__ASSET_ic_point_l__";
const RX_DAILY_SKIP = /^(all_clear|notify|notify_resume|welcome|attendance|makeup|play_total)/;
function rxSec(title, meta) {
  return el("div", "sk-rx-sec", [el("b", "", [title]), meta ? el("span", "", [meta]) : null]);
}
function rxChip(text) {
  return el("b", "sk-rx-chip", [text.replace(/^\+\s*/, "")]);
}
function skinRewardMissions(dialog) {
  dialog.classList.add("sk-rx--missions");
  const body = dialog.querySelector(".gf-rx-body");
  if (!body) return;
  let repeatAt = null, dailyAt = null, dailyLeft = 0;
  let dailyOpen = null;
  const doneRows = [];
  for (const row of body.querySelectorAll(".gf-rx-row")) {
    const key = row.getAttribute("data-row") || (row.classList.contains("attendance") ? "attendance" : "");
    const copy = row.querySelector(".gf-rx-copy");
    const small = copy && copy.querySelector("small");
    const reward = copy && copy.querySelector(":scope > b");
    if (reward) { reward.textContent = txt(reward).replace(/^\+\s*/, ""); reward.classList.add("sk-rx-chip"); }
    if (key === "attendance") {
      // 출석 선물 = 카드(--att, 늘) + 아래 전체 폭 버튼. "오늘 받을 선물 · 5P" 의 보상은 제목 옆 칩으로
      // 노란 테두리(--gift)는 지금 받을 수 있을 때만(한입컷 기준): SDK 0.38.9+ 는 줄에 claimable 을 단다.
      // 그 전 SDK 는 받기 버튼으로 판단 — attendance-claim, 또는 econ6 반복 줄의 attendance 버튼 "받기"·"출석하고…"
      const dayBtn = row.querySelector('[data-rx="attendance"]');
      const claimable = row.classList.contains("claimable") || !!row.querySelector('[data-rx="attendance-claim"]') ||
        !!(dayBtn && /받기|출석하고/.test(txt(dayBtn)));
      row.classList.add("sk-rx-card", "sk-rx-card--att");
      row.classList.toggle("sk-rx-card--gift", claimable);
      const m = small && txt(small).match(/^(.*?)\s*·\s*(.+)$/);
      const strong = copy && copy.querySelector("strong");
      if (m && strong) { small.textContent = m[1]; strong.after(rxChip(m[2])); }
      const btn = row.querySelector(".gf-rx-btn.login");
      if (btn && txt(btn) === "로그인") btn.textContent = "로그인하고 받기";
    } else if (key === "all_clear") {
      row.classList.add("sk-rx-card");
      const t = copy && copy.querySelector("strong");
      if (t && txt(t) === "오늘의 미션 보너스") t.textContent = "오늘 달성 보너스"; // Figma P07-1 문구
      const total = small && txt(small).match(/\/(\d+)/);
      if (small && total && reward) small.textContent = `${txt(small)} · ${total[1]}개 모두 달성 시 ${txt(reward)} 지급!`;
    } else if (key.startsWith("play_every")) {
      if (row.classList.contains("done")) {
        // 하루 받을 수를 다 채운 반복 미션(SDK 0.36.5+ "오늘 N번 다 받았어요")도 완료 디자인으로 맨 아래 — SDK 문구는 그대로
        const t = copy && copy.querySelector("strong");
        if (t) t.textContent = `${txt(t)} 미션완료!`;
        if (reward) reward.remove();
        doneRows.push(row);
      } else {
        if (!repeatAt) repeatAt = row;
        if (small) small.textContent = `${txt(small)} · 계속 반복`;
      }
    } else if (key && !RX_DAILY_SKIP.test(key)) {
      if (!dailyAt) dailyAt = row;
      if (!row.classList.contains("done")) dailyLeft++;
      // 20판은 제목 꼬리 "(14시 초기화)" 를 진행 문구로 옮긴다(Figma: "20판 플레이" · "8/20 · 14시 초기화")
      const t = copy && copy.querySelector("strong");
      const reset = t && txt(t).match(/^(.*?)\s*\((\d+시) 초기화\)$/);
      if (reset) t.textContent = reset[1];
      const at = reset ? reset[2] : "0시";
      if (row.classList.contains("done")) {
        // 완료 미션(Figma "완료 미션 상태"): "제목 미션완료!" · 보상 칩 대신 초기화 안내, 목록 맨 아래로 내린다
        if (t) t.textContent = `${txt(t)} 미션완료!`;
        if (reward) reward.remove();
        if (small) small.textContent = `미션은 ${at} 초기화돼요`;
        else if (copy) copy.append(el("small", "", [`미션은 ${at} 초기화돼요`]));
        doneRows.push(row);
      } else {
        if (!dailyOpen) dailyOpen = row;
        if (small) small.textContent = `${txt(small)} · ${at} 초기화`;
      }
    }
  }
  const rows = body.querySelectorAll(".gf-rx-row");
  // SDK 0.38.11+ [누적 미션] 묶음(econ6, 토스): 일일 완료 줄은 그 제목 앞(일일 묶음 끝)에 두고, SDK 제목은 다른 묶음과 같은 모양으로 바꾼다.
  // 누적 줄(play_total:N)은 RX_DAILY_SKIP 이라 일일 묶음에 섞이지 않는다(보기 전용 — 손대지 않는다). 제목이 없으면(econ6 아님) 예전 그대로.
  const totalHead = body.querySelector('.gf-rx-sec-title[data-sec="total"]');
  if (doneRows.length) {
    if (totalHead) totalHead.before(...doneRows);
    else rows[rows.length - 1].after(...doneRows);
  }
  if (totalHead) {
    const n = Number(totalHead.getAttribute("data-count"));
    totalHead.before(rxSec("누적 미션", Number.isSafeInteger(n) ? `총 ${n.toLocaleString("en-US")}판` : ""));
    totalHead.remove();
  }
  if (repeatAt) repeatAt.before(rxSec("반복 미션", "하루 동안 계속"));
  if (dailyAt) (dailyOpen || dailyAt).before(rxSec("일일 미션", dailyLeft ? `남은 ${dailyLeft}개` : "모두 완료"));
}
function skinRewardDays(dialog) {
  for (const d of dialog.querySelectorAll(".gf-rx-day")) {
    const b = d.querySelector(":scope > b");
    if (b && /^\d/.test(txt(b))) b.textContent = `+${txt(b)}`;
    // 받은 날·기간 만료 칸 그림은 SDK 0.38.10 이 아이콘 키(attendanceGot·attendanceExpired = 한입컷 ic_got·ic_expired)로 그린다
  }
}
function skinReward(dialog) {
  // 큰 토스포인트(80px)는 고해상도 그림(Figma Game/coin_blue)으로
  for (const img of dialog.querySelectorAll(".gf-rx-gift > .gf-rx-icon > img")) if (img.getAttribute("src") === IC.point) img.src = IC_POINT_L;
  const foot = dialog.querySelector(".gf-rx-foot");
  if (!foot || !foot.children.length) dialog.classList.add("sk-rx--nofoot");
  if (dialog.querySelector(".gf-rx-body.missions")) skinRewardMissions(dialog);
  if (dialog.querySelector(".gf-rx-calendar")) skinRewardDays(dialog);
}
function sweep(root) {
  for (const c of root.querySelectorAll(`.gf-onb-card:not([${SKIN}])`)) {
    c.setAttribute(SKIN, "");
    try {
      skinOnboarding(c);
      swapIcons(c);
    } catch (e) {
      console.warn("[sdk-skin] onboarding", e);
    }
  }
  for (const c of root.querySelectorAll(`.gf-lb-card:not([${SKIN}])`)) {
    c.setAttribute(SKIN, "");
    try {
      skinLeaderboard(c);
      swapIcons(c);
    } catch (e) {
      console.warn("[sdk-skin] lb", e);
    }
  }
  for (const c of root.querySelectorAll(`.gf-hub-card:not([${SKIN}])`)) {
    c.setAttribute(SKIN, "");
    try {
      skinHub(c);
      swapIcons(c);
    } catch (e) {
      console.warn("[sdk-skin] hub", e);
    }
  }
  for (const c of root.querySelectorAll(`.gf-rx-dialog:not([${SKIN}])`)) {
    c.setAttribute(SKIN, "");
    try {
      skinReward(c);
    } catch (e) {
      console.warn("[sdk-skin] reward", e);
    }
  }
  for (const b of root.querySelectorAll(`.gf-hub-pill:not([${SKIN}]), .gf-lb-pill:not([${SKIN}])`)) {
    b.setAttribute(SKIN, "");
    try {
      skinPill(b, b.classList.contains("gf-hub-pill"));
    } catch (e) {
      console.warn("[sdk-skin] pill", e);
    }
  }
  for (const c of root.querySelectorAll(`.gf-wel-card:not([${SKIN}])`)) {
    c.setAttribute(SKIN, "");
    try {
      skinWelcome(c);
      swapIcons(c);
    } catch (e) {
      console.warn("[sdk-skin] welcome", e);
    }
  }
}
// 랭킹 배지 폭 → 포털 --sk-lb-w(CSS 가 미션 배지를 그 오른쪽에 둔다). 꾸밀 때 한 번만 재면 숨김(폭 0)·글꼴 로드 전 폭이 남으므로
// ResizeObserver 로 크기가 바뀔 때마다 다시 잰다. 폭 0(랭킹 카드가 열려 숨김)은 마지막 값을 두고, 배지가 사라지면 변수를 지운다.
// (라이브 버스팝·타일팝 스킨 trackRankingWidth 그대로)
let lbTracked = null, lbPortal = null, lbResize = null;
function trackRankingWidth(portal) {
  const badge = portal.querySelector(".gf-lb-badge");
  const publish = () => {
    const w = badge ? badge.offsetWidth : 0;
    if (w > 0) portal.style.setProperty("--sk-lb-w", `${Math.ceil(w)}px`);
  };
  if (badge === lbTracked && portal === lbPortal) {
    if (!lbResize) publish();
    return;
  }
  if (lbResize) {
    lbResize.disconnect();
    lbResize = null;
  }
  if (lbPortal && lbPortal !== portal) lbPortal.style.removeProperty("--sk-lb-w");   // 포털이 바뀌면 옛 포털 값은 버린다
  lbTracked = badge;
  lbPortal = portal;
  if (!badge) {
    portal.style.removeProperty("--sk-lb-w");
    return;
  }
  publish();
  if (typeof ResizeObserver !== "undefined") {
    lbResize = new ResizeObserver(publish);
    lbResize.observe(badge);
  }
}
let installed = false;
function installSdkSkin() {
  if (installed || typeof MutationObserver === "undefined" || !document.body) return;
  installed = true;
  let portal = null;
  const inner = new MutationObserver(() => {
    if (!portal) return;
    sweep(portal);
    trackRankingWidth(portal);
  });
  const attach = () => {
    const p = document.getElementById("__gf-portal");
    if (!p || p === portal) return;
    inner.disconnect();
    portal = p;
    inner.observe(p, { childList: true, subtree: true });
    sweep(p);
    trackRankingWidth(p);
  };
  new MutationObserver(attach).observe(document.body, { childList: true });
  attach();
}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installSdkSkin);
  else installSdkSkin();
})();

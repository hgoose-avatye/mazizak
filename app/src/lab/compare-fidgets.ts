import "../style.css";
import { AudioEngine } from "../core/audio";
import { FIDGETS } from "../toys/fidgets/catalog";
import { resolveToy, type ResolvedToy } from "../toys/fidgets/audio";
import { EVENTS, FALLBACK, strengthDb } from "../toys/fidgets/soundBank";

/**
 * Listening lab: MANZIZAK clips (as the app plays them) next to the sound files of the installed reference app
 * (served read-only from the app bundle by the dev server; nothing is copied or stored). Dev only.
 * It records the listener's verdicts per clip; it never changes any sound by itself.
 */
const audio = new AudioEngine(16);
for (const t of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(t, (e) => audio.unlock(e), { capture: true, passive: true });
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const STORE = "mzk-compare-v1";
interface Verdict { v: "keep" | "drop"; src?: string; srcStart?: number; label: string }
let verdicts: Record<string, Verdict> = {};
let sel: Record<string, string> = {};
try { verdicts = JSON.parse(localStorage.getItem(STORE + ":verdicts") ?? "{}"); sel = JSON.parse(localStorage.getItem(STORE + ":sel") ?? "{}"); } catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(STORE + ":verdicts", JSON.stringify(verdicts)); localStorage.setItem(STORE + ":sel", JSON.stringify(sel)); } catch { /* ignore */ } };

let active: AudioBufferSourceNode | null = null;
const stopAll = () => { try { active?.stop(); } catch { /* already stopped */ } active = null; };
/** direct playback at a fixed level (so both sides are comparable); optional peak matching */
function playBuffer(buf: AudioBuffer, gainDb: number, rate = 1) {
  const go = () => {
    stopAll();
    let db = gainDb;
    if ($<HTMLInputElement>("#match").checked) {
      const d = buf.getChannelData(0); let pk = 1e-9; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      db = -12 - 20 * Math.log10(pk);
    }
    const src = audio.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = audio.ctx.createGain(); g.gain.value = Math.min(4, Math.pow(10, db / 20)) * 0.9;
    src.connect(g).connect(audio.ctx.destination); src.start(); active = src;
  };
  if (audio.ctx.state === "running") go(); else void audio.ctx.resume().then(go);
}

const status = $("#status");
const toySel = $<HTMLSelectElement>("#toy"), origSel = $<HTMLSelectElement>("#orig");
for (const f of FIDGETS) toySel.add(new Option(`${f.id} ${f.name}`, f.id));
toySel.value = sel.toy ?? FIDGETS[0].id;
let originals: Record<string, string[]> = {};
const resolved = new Map<string, ResolvedToy>();
const origCache = new Map<string, Promise<AudioBuffer>>();
const origBuf = (file: string) => {
  let p = origCache.get(file);
  if (!p) origCache.set(file, (p = fetch(`/__original-wak/${file}`).then(async (r) => { if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return audio.ctx.decodeAudioData(await r.arrayBuffer()); })));
  return p;
};

function clipRow(label: string, info: string, key: string, onPlay: () => void, meta: Omit<Verdict, "v">): HTMLElement {
  const row = document.createElement("div"); row.className = "clip";
  const play = document.createElement("button"); play.className = "play"; play.textContent = "▶"; play.onclick = onPlay;
  const lab = document.createElement("span"); lab.className = "lab"; lab.innerHTML = `${label}<br><small>${info}</small>`;
  row.append(play, lab);
  if (key) for (const [v, txt, cls] of [["keep", "유지", "keep"], ["drop", "제외", "drop"]] as const) {
    const b = document.createElement("button"); b.className = `v ${cls}`; b.textContent = txt; b.setAttribute("aria-pressed", String(verdicts[key]?.v === v));
    b.onclick = () => { if (verdicts[key]?.v === v) delete verdicts[key]; else verdicts[key] = { v, ...meta }; save(); row.querySelectorAll(".v").forEach((x) => x.setAttribute("aria-pressed", String(verdicts[key]?.v === (x.classList.contains("keep") ? "keep" : "drop")))); showOut(); };
    row.append(b);
  }
  return row;
}

async function renderLeft(id: string) {
  const left = $("#left"); left.textContent = "불러오는 중…";
  let r = resolved.get(id);
  if (!r) { r = await resolveToy(audio.ctx, FIDGETS.find((f) => f.id === id)!); resolved.set(id, r); }
  left.textContent = "";
  $("#lt").textContent = `MANZIZAK ${id} — ${FIDGETS.find((f) => f.id === id)!.name}`;
  const mid = document.createElement("p"); mid.className = "muted"; mid.textContent = `출처 요약: ${r.source}`; left.append(mid);
  for (const ev of EVENTS) {
    const e = r.events[ev];
    const box = document.createElement("div"); box.className = "evt";
    if (!e) {
      const fb = FALLBACK[ev]; const has = fb && r.events[fb];
      box.innerHTML = `<b>${ev}</b> <small>${has ? `전용 소리 없음 → <b>${fb}</b> 소리로 대체됨` : "소리 없음(의도적 또는 품질 기준 미달로 제외됨)"}</small>`;
      left.append(box); continue;
    }
    box.innerHTML = `<b>${ev}</b> <small>${e.origin} · 클립 ${e.main.length}${e.alt ? ` + 강한 이벤트용 ${e.alt.length}` : ""} · rate ${e.rate[0].toFixed(2)}–${e.rate[1].toFixed(2)} · ${e.ref?.note ?? ""}</small>`;
    const add = (list: typeof e.main, tag: string) => list.forEach((c, i) => {
      const key = `${id}|${ev}|${tag}|${c.label}`;
      box.append(clipRow(`${tag === "a" ? "[강] " : ""}${c.label}`, c.info ?? "", key, () => playBuffer(c.buffer, e.baseDb + strengthDb(0.8), 1), { src: c.src, srcStart: c.srcStart, label: `${id} ${ev} ${c.label}` }));
      void i;
    });
    add(e.main, "m"); if (e.alt) add(e.alt, "a");
    left.append(box);
  }
}

async function renderRight(folder: string) {
  const right = $("#right"); right.textContent = "";
  $("#rt").textContent = folder ? `원본 왁뿌볼 — ${folder}` : "원본 왁뿌볼";
  if (!folder) { right.innerHTML = '<p class="muted">위의 "원본 폴더"에서 비교할 원본 장난감을 고르세요(이름이 같거나 비슷한 것을 직접 고르는 방식입니다. 기본값은 추정이 아닙니다).</p>'; return; }
  const files = originals[folder] ?? [];
  const groups = new Map<string, string[]>();
  for (const f of files) { const m = /(init|short|long|charge|completed|bounce|down|pop|click)/i.exec(f); const g = m ? m[1].toLowerCase() : "other"; groups.set(g, [...(groups.get(g) ?? []), f]); }
  for (const [g, list] of groups) {
    const box = document.createElement("div"); box.className = "evt"; box.innerHTML = `<b>${g}</b> <small>${list.length}개</small>`;
    for (const f of list) box.append(clipRow(f, "원본 앱 파일(읽기 전용)", "", async () => { try { playBuffer(await origBuf(`${folder}/${f}`), -6); } catch (e) { status.textContent = String(e); } }, { label: f }));
    right.append(box);
  }
}

/** dev server copy of the verdicts (git-ignored bench-out/lab-verdicts.json), so they can be applied without copy/paste */
const push = () => { void fetch("/__lab-verdicts", { method: "POST", body: JSON.stringify({ at: new Date().toISOString(), verdicts }) }).catch(() => undefined); };
function showOut() {
  push();
  const drop = Object.entries(verdicts).filter(([, v]) => v.v === "drop"), keep = Object.entries(verdicts).filter(([, v]) => v.v === "keep");
  $("#count").textContent = `제외 ${drop.length} · 유지 ${keep.length}`;
  const exclude = drop.filter(([, v]) => v.src !== undefined).map(([, v]) => ({ src: v.src, srcStart: v.srcStart, tol: 0.03, reason: "listener: " + v.label }));
  const other = drop.filter(([, v]) => v.src === undefined).map(([k, v]) => ({ key: k, label: v.label }));
  $("#out").textContent = JSON.stringify({ at: new Date().toISOString(), exclude, excludeOtherSources: other, kept: keep.map(([k]) => k) }, null, 1);
}

(async () => {
  try {
    originals = await (await fetch("/__original-wak/index.json")).json();
    origSel.add(new Option("— 선택 —", ""));
    for (const k of Object.keys(originals)) origSel.add(new Option(`${k} (${originals[k].length})`, k));
    status.textContent = "원본 앱 소리 목록을 불러왔습니다. 원본 폴더는 직접 고르세요.";
  } catch {
    origSel.add(new Option("(원본 소리 서버 비활성)", ""));
    status.textContent = "원본 소리는 MANZIZAK_ORIGINAL_APP_DIR 로 서버를 띄웠을 때만 열립니다. 왼쪽(MANZIZAK) 청취는 그대로 가능합니다.";
  }
  const go = async () => { sel.toy = toySel.value; sel[toySel.value] = origSel.value; save(); await renderLeft(toySel.value); await renderRight(origSel.value); };
  toySel.onchange = () => { origSel.value = sel[toySel.value] ?? ""; void go(); };
  origSel.onchange = () => void go();
  origSel.value = sel[toySel.value] ?? "";
  $("#stop").onclick = stopAll;
  $("#copy").onclick = async () => { showOut(); try { await navigator.clipboard.writeText($("#out").textContent ?? ""); $("#copy").textContent = "복사됨"; } catch { /* select manually */ } };
  $("#clear").onclick = () => { verdicts = {}; save(); location.reload(); };
  showOut();
  await go();
})();

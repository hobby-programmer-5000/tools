// Photo Painter page: draws the strokes that painter.js plans, one brush size after another.
// The photo is read in this browser only. This file makes no network requests.
import * as P from "./painter.js";

const $ = (id) => document.getElementById(id);
const t = (k, v) => window.Site.t(k, v);
const cv = $("paint"), ctx = cv.getContext("2d", { willReadFrequently: true });
const wet = $("wet"), wctx = wet.getContext("2d");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_PIXELS = 400e6;   // same cap as Scrollfold
const MAX_SLOT = 0.35;      // longest one stroke may take at 1x, so a brush with few strokes does not crawl
const START = P.DUR.map((_, i) => P.DUR.slice(0, i).reduce((a, b) => a + b, 0));   // progress when brush i starts

const s = {
  W: P.LONG, H: P.LONG, ref: null, fileName: "", srcW: 0, srcH: 0,
  rng: null, li: 0, layer: null, T: 0, count: 0, done: false, running: true, speed: 1,
  run: 0, finishing: false,                       // run changes on every restart; finishing: End is working
  curX: 0, curY: 0, curHex: P.PAPER.slice(1), status: null,
};
let loadSeq = 0;

// ------------------------------------------------------------------ text
function setStatus(key, vars, error = false) {
  s.status = key ? { key, vars, error } : null;
  $("status").textContent = key ? t(key, vars) : "";
  $("status").classList.toggle("error", error);
}
let nf = null, nfLang = "";
function num(n) {
  if (nfLang !== window.Site.lang) { nfLang = window.Site.lang; nf = new Intl.NumberFormat(nfLang === "ko" ? "ko-KR" : "en-US"); }
  return nf.format(n);
}
function applyLang() {
  if (s.status) setStatus(s.status.key, s.status.vars && { ...s.status.vars, ...(s.status.vars.n !== undefined && { n: num(s.count) }) }, s.status.error);
  paintUI();
}

// ------------------------------------------------------------------ drawing
function drawStroke(c, st, b, upto) {               // upto: length to draw, or undefined for all
  const p = st.pts;
  c.strokeStyle = c.fillStyle = "#" + st.hex;
  if (p.length === 2 || upto === 0) { c.beginPath(); c.arc(p[0], p[1], b / 2, 0, Math.PI * 2); c.fill(); return [p[0], p[1]]; }
  c.lineWidth = b; c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath(); c.moveTo(p[0], p[1]);
  let ex = p[0], ey = p[1], left = upto === undefined ? Infinity : upto;
  for (let k = 2; k < p.length; k += 2) {
    const seg = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
    if (seg <= left) { ex = p[k]; ey = p[k + 1]; left -= seg; c.lineTo(ex, ey); }
    else { const f = left / seg; ex = p[k - 2] + (p[k] - p[k - 2]) * f; ey = p[k - 1] + (p[k + 1] - p[k - 1]) * f; c.lineTo(ex, ey); break; }
  }
  c.stroke(); return [ex, ey];
}
function newLayer(i) {
  const strokes = P.planLayer(i, s.W, s.H, s.ref, ctx.getImageData(0, 0, s.W, s.H).data, s.rng);
  const n = strokes.length, dur = Math.min(P.DUR[i], n * MAX_SLOT);   // a brush with nothing to do takes no time
  return { b: P.SIZES[i], strokes, n, t: 0, dur, committed: 0, slot: dur / Math.max(1, n) };
}
function commitTo(n) {                              // lay strokes [committed, n) on the painting
  const L = s.layer;
  for (; L.committed < n; L.committed++) {
    const st = L.strokes[L.committed];
    const e = drawStroke(ctx, st, L.b);
    s.curX = e[0]; s.curY = e[1]; s.curHex = st.hex; s.count++;
  }
}
function renderLayer() {
  const L = s.layer;
  wctx.clearRect(0, 0, s.W, s.H);
  if (!L.n) return;
  const idx = Math.min(L.n, Math.floor(L.t / L.slot + 1e-9));
  commitTo(idx);
  if (idx >= L.n || L.slot < 0.012) return;         // small strokes: no travel, many per frame
  const st = L.strokes[idx], f = (L.t - idx * L.slot) / L.slot, travel = 0.38;
  if (f < travel) {                                 // the cursor travels to the stroke
    const u = f / travel, e = u * u * (3 - 2 * u);
    L.px = s.curX + (st.pts[0] - s.curX) * e; L.py = s.curY + (st.pts[1] - s.curY) * e; L.wetHex = null;
  } else {                                          // then draws along it
    const e = drawStroke(wctx, st, L.b, st.len * (f - travel) / (1 - travel));
    L.px = e[0]; L.py = e[1]; L.wetHex = st.hex;
  }
}
function advance(dt) {
  if (!s.ref) return;
  let left = dt;
  while (left > 1e-9 && !s.done) {
    if (!s.layer) s.layer = newLayer(s.li);
    const L = s.layer, use = Math.min(L.dur - L.t, left);
    L.t += use; left -= use;
    L.px = L.py = undefined; L.wetHex = null;
    if (L.t >= L.dur - 1e-9) {
      commitTo(L.n); wctx.clearRect(0, 0, s.W, s.H);
      s.li++; s.layer = null;
      if (s.li >= P.SIZES.length) { s.done = true; s.T = P.TOTAL; setStatus("pp.doneStatus", { n: num(s.count) }); }
      else s.T = START[s.li];
    } else { s.T = START[s.li] + P.DUR[s.li] * L.t / L.dur; renderLayer(); }
  }
  paintUI();
}
// End: finish one brush per turn, so the page keeps responding while the rest is planned.
async function finishNow() {
  if (!s.ref || s.done || s.finishing) return;
  const run = s.run;
  s.finishing = true; paintUI();
  while (s.run === run && !s.done) {
    if (!s.layer) s.layer = newLayer(s.li);
    advance(Math.max(s.layer.dur - s.layer.t, 2e-9));
    await new Promise((r) => setTimeout(r));
  }
  if (s.run === run) { s.finishing = false; paintUI(); }
}

// ------------------------------------------------------------------ interface
const sizeEls = P.SIZES.map((n) => { const e = document.createElement("li"); e.textContent = n; $("sizes").append(e); return e; });
const passEls = [...$("passes").children];
const current = (e, on) => { if (on) e.setAttribute("aria-current", "true"); else e.removeAttribute("aria-current"); };
function paintUI() {
  const has = !!s.ref, cur = s.done || !has ? -1 : s.li, pass = cur >> 1, L = s.layer, idle = !has || s.done || s.finishing;
  document.body.classList.toggle("has-image", has);
  sizeEls.forEach((e, k) => { e.classList.toggle("on", k === cur); current(e, k === cur); });
  passEls.forEach((e, k) => { e.className = !has ? "" : s.done || k < pass ? "done" : k === pass ? "on" : ""; current(e, has && !s.done && k === pass); });
  const hex = (L && L.wetHex) || s.curHex;
  $("hex").textContent = "#" + hex; $("swatch").style.background = "#" + hex;
  $("count").textContent = t(s.done ? "pp.finished" : "pp.strokes", { n: num(s.count) });
  const pct = Math.min(100, s.T / P.TOTAL * 100);
  $("bar").firstElementChild.style.width = pct + "%"; $("bar").setAttribute("aria-valuenow", Math.round(pct));
  const c = $("cursor"), show = has && !s.done && (s.count > 0 || (L && L.px !== undefined));
  c.hidden = !show;
  if (show) {
    const x = L && L.px !== undefined ? L.px : s.curX, y = L && L.px !== undefined ? L.py : s.curY, k = cv.clientWidth / s.W;
    c.style.transform = `translate(${(x * k).toFixed(2)}px,${(y * k).toFixed(2)}px)`;
  }
  $("pause").textContent = s.running || s.done ? t("pp.pause") : t("pp.resume");
  for (const id of ["pause", "s1", "s3", "end"]) $(id).disabled = idle;
  for (const id of ["save", "restart"]) $(id).disabled = !has;
  $("dims").textContent = `${s.W} × ${s.H} px`;
}

function reset() {
  if (!s.ref) return;
  Object.assign(s, { rng: P.mulberry32(P.SEED), li: 0, layer: null, T: 0, count: 0, done: false, running: true,
    run: s.run + 1, finishing: false, curX: s.W / 2, curY: 0, curHex: P.PAPER.slice(1) });
  ctx.fillStyle = P.PAPER; ctx.fillRect(0, 0, s.W, s.H); wctx.clearRect(0, 0, s.W, s.H);
  paintUI();
  if (reduced) finishNow();                         // no animation: go straight to the finished painting
}
function sizeCanvas(w, h) {
  s.W = w; s.H = h;
  cv.width = wet.width = w; cv.height = wet.height = h;
  $("easel").style.setProperty("--ar", w / h);
  ctx.fillStyle = P.PAPER; ctx.fillRect(0, 0, w, h);
}
function setSpeed(v) { s.speed = v; $("s1").setAttribute("aria-pressed", v === 1); $("s3").setAttribute("aria-pressed", v === 3); }
function togglePause() { if (s.ref && !s.done && !s.finishing) { s.running = !s.running; paintUI(); } }

// ------------------------------------------------------------------ loading and saving
async function load(file) {
  if (!file) return;
  if (file.size === 0) { setStatus("pp.empty", null, true); return; }
  const mine = ++loadSeq;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { if (mine === loadSeq) setStatus("pp.notImage", null, true); return; }
  if (mine !== loadSeq) { bmp.close(); return; }   // a newer photo was opened while this one was decoding
  const px = bmp.width * bmp.height;
  if (px > MAX_PIXELS) { bmp.close(); setStatus("pp.tooLarge", { mp: Math.round(px / 1e6) }, true); return; }
  const [w, h] = P.fitSize(bmp.width, bmp.height);
  const o = document.createElement("canvas"); o.width = w; o.height = h;
  const oc = o.getContext("2d");
  oc.fillStyle = "#fff"; oc.fillRect(0, 0, w, h);   // transparent areas are painted as white, not black
  oc.imageSmoothingQuality = "high"; oc.drawImage(bmp, 0, 0, w, h);
  Object.assign(s, { ref: P.channels(oc.getImageData(0, 0, w, h).data, w * h), fileName: file.name || "", srcW: bmp.width, srcH: bmp.height });
  bmp.close();
  sizeCanvas(w, h);
  const rc = $("ref"); rc.width = w; rc.height = h; rc.getContext("2d").drawImage(o, 0, 0);
  $("file-name").textContent = s.fileName; $("file-name").title = s.fileName;
  setStatus("pp.loaded", { name: s.fileName || "image", w: s.srcW, h: s.srcH, pw: w, ph: h });
  reset();
  // The painting starts at once, so bring it into view.
  $("studio").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
function save() {
  if (!s.ref) return;
  const finished = s.done, name = P.pngName(s.fileName);
  cv.toBlob((blob) => {
    if (!blob) { setStatus("pp.saveFail", null, true); return; }
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus(finished ? "pp.saved" : "pp.savedMid", { file: name });
    window.Site.toast(t("pp.toastSaved"));         // no file name here: the toast is drawn in the web font
  }, "image/png");
}

// ------------------------------------------------------------------ wiring
function wire() {
  const drop = $("drop");
  const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  $("file").addEventListener("change", async (e) => { await load(e.target.files[0]); e.target.value = ""; $("browse").focus({ preventScroll: true }); });
  $("browse").addEventListener("click", () => $("file").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, () => drop.classList.add("over"));
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  // A photo can be dropped anywhere on the page, the painting included. Without this the browser would open the file.
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => { if (hasFiles(e)) { e.preventDefault(); load(e.dataTransfer.files[0]); } });
  window.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/")); if (f) load(f); });

  $("pause").addEventListener("click", togglePause);
  $("restart").addEventListener("click", reset);
  $("s1").addEventListener("click", () => setSpeed(1));
  $("s3").addEventListener("click", () => setSpeed(3));
  $("end").addEventListener("click", finishNow);
  $("save").addEventListener("click", save);
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "o") { e.preventDefault(); $("file").click(); }
      if (e.key === "s") { e.preventDefault(); save(); }
      return;
    }
    // Space pauses while a painting is running, unless it is pressing a control. Otherwise it scrolls as usual.
    if (e.key === " " && !e.altKey && !e.shiftKey && !e.repeat && s.ref && !s.done && !s.finishing
        && !e.target.closest("button, a, input, select, label")) { e.preventDefault(); togglePause(); }
  });
  new ResizeObserver(paintUI).observe($("easel"));
}

let lastNow = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  if (s.running && !s.done && !s.finishing && s.ref) advance(dt * s.speed);
  requestAnimationFrame(tick);
}

sizeCanvas(P.LONG, P.LONG);
wire();
window.Site.onChange(applyLang);
requestAnimationFrame(tick);
// Test hook, only with #selftest.
if (location.hash === "#selftest") window.photoPainter = { load, state: s, advance, finishNow, save };

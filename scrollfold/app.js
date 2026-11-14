// Scrollfold page for the tools site: browser only, results as a zip (or a folder in Chromium).
// The splitting logic is split.js, copied unchanged from hobby-programmer-5000/scrollfold (web/split.js).
import * as S from "./split.js";

const $ = (id) => document.getElementById(id);
const t = (k, v) => window.Site.t(k, v);
const GAP = 6;
const LINE = "#ff4040";
const ZOOMS = ["fit", 10, 25, 50, 100, 200];
const MAX_VIEW = 16000; // canvas side cap for previews

// This page starts with the source ratio (no cropping, nothing to decide) and lists it first.
// split.js keeps the full app's default; it is not changed here.
const DEFAULT_RATIO = "original";
const RATIO_ORDER = ["original", ...Object.keys(S.RATIOS).filter((k) => k !== "original")];
const state = { file: null, bmp: null, name: "", ratioKey: DEFAULT_RATIO, fit: S.DEFAULT_FIT, busy: false, cancel: false };

// ------------------------------------------------------------------ text
function applyLang() {
  buildRatio();
  $("fit").replaceChildren(...S.FIT_MODES.map((m) => new Option(t("sf.fit_" + m), m, false, m === state.fit)));
  const zoom = $("zoom"), cur = zoom.value || "fit";
  zoom.replaceChildren(...ZOOMS.map((z) => new Option(z === "fit" ? t("sf.fit") : `${z}%`, String(z), false, String(z) === cur)));
  render();
}

function buildRatio() {
  $("ratio").replaceChildren(...RATIO_ORDER.map((k) => {
    const label = document.createElement("label");
    const input = Object.assign(document.createElement("input"), { type: "radio", name: "ratio", value: k, checked: k === state.ratioKey });
    input.addEventListener("change", () => { state.ratioKey = k; autoCount(); });
    const span = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = k === "original" ? t("sf.ratioOriginal") : k;
    const small = document.createElement("small");
    small.textContent = t("sf.hint_" + k);
    span.append(b, small);
    label.append(input, span);
    return label;
  }));
}

function setStatus(msg, error = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", error);
}

// ------------------------------------------------------------------ state helpers
const ratio = () => S.RATIOS[state.ratioKey];
function count() {
  let n = parseInt($("count").value, 10);
  if (!Number.isFinite(n)) n = S.DEFAULT_STRIPS;
  n = Math.min(S.MAX_STRIPS, Math.max(S.MIN_STRIPS, n));
  $("count").value = n;
  return n;
}
function autoCount() {
  if (state.bmp) $("count").value = S.suggestCount(state.bmp.width, state.bmp.height, ratio());
  render();
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Draw the fitted image (what gets split) into ctx, in fitted coordinates.
let blurBg = null; // small blurred cover image, cached per plan size
function drawFitted(ctx, p) {
  const b = state.bmp;
  if (state.fit !== "crop" && ratio()) {
    if (state.fit === "blur") {
      const key = `${p.w}x${p.h}`;
      if (!blurBg || blurBg.key !== key) {
        const s = Math.max(p.w / b.width, p.h / b.height);
        const bw = Math.max(p.w, Math.round(b.width * s)), bh = Math.max(p.h, Math.round(b.height * s));
        const c = canvas(Math.max(1, bw >> 3), Math.max(1, bh >> 3));
        const g = c.getContext("2d");
        g.filter = "blur(6px) brightness(75%)";
        g.drawImage(b, 0, 0, c.width, c.height);
        blurBg = { key, c, bw, bh };
      }
      ctx.drawImage(blurBg.c, -(blurBg.bw - p.w) / 2, -(blurBg.bh - p.h) / 2, blurBg.bw, blurBg.bh);
    } else {
      ctx.fillStyle = state.fit === "black" ? "#000" : "#fff";
      ctx.fillRect(0, 0, p.w, p.h);
    }
  }
  const [cx0, cy0] = p.crop;
  ctx.drawImage(b, p.offset[0] - cx0, p.offset[1] - cy0);
}

function scaleFor(w, h, scroller, extraW = 0) {
  const z = $("zoom").value;
  const s = z === "fit" || !z ? Math.min((scroller.clientWidth - extraW - 2) / w, (scroller.clientHeight - 2) / h) : Number(z) / 100;
  return Math.max(0.001, Math.min(s, MAX_VIEW / Math.max(w, h)));
}

// ------------------------------------------------------------------ render previews
function render() {
  const srcC = $("src-canvas"), prevC = $("prev-canvas");
  document.body.classList.toggle("has-image", !!state.bmp);
  if (!state.bmp) { srcC.width = srcC.height = prevC.width = prevC.height = 0; return; }
  const n = count(), r = ratio(), b = state.bmp;
  let p, boxes;
  try {
    p = S.plan(b.width, b.height, n, r, state.fit);
    boxes = S.stripBoxes(p.w, p.h, n);
  } catch (e) { setStatus(e instanceof S.SplitError ? t("sf." + e.kind, e.info) : e.message, true); return; }

  // Source pane. Crop: whole source, dropped area dimmed. Pad: the padded canvas.
  const cropMode = r && state.fit === "crop";
  const showW = cropMode ? b.width : p.w, showH = cropMode ? b.height : p.h;
  const s = scaleFor(showW, showH, $("src-scroll"));
  srcC.width = Math.max(1, Math.round(showW * s)); srcC.height = Math.max(1, Math.round(showH * s));
  const g = srcC.getContext("2d");
  g.setTransform(s, 0, 0, s, 0, 0);
  if (cropMode) {
    g.drawImage(b, 0, 0);
    if (p.w !== b.width || p.h !== b.height) {
      g.fillStyle = "rgb(0 0 0 / .65)";
      const [x0, y0, x1, y1] = p.crop;
      g.fillRect(0, 0, b.width, y0); g.fillRect(0, y1, b.width, b.height - y1);
      g.fillRect(0, y0, x0, y1 - y0); g.fillRect(x1, y0, b.width - x1, y1 - y0);
    }
  } else drawFitted(g, p);
  const [ox, oy] = cropMode ? p.crop : [0, 0];
  g.strokeStyle = LINE; g.lineWidth = 2 / s;
  g.beginPath();
  for (const [x0, , x1] of boxes) for (const x of [x0, x1]) { g.moveTo(ox + x, oy); g.lineTo(ox + x, oy + p.h); }
  g.stroke();

  // Preview pane: strips side by side with gaps.
  const sw = boxes[0][2] - boxes[0][0];
  const s2 = scaleFor(sw * n, p.h, $("prev-scroll"), GAP * (n - 1));
  const tw = Math.max(1, Math.floor(sw * s2)), th = Math.max(1, Math.floor(p.h * s2));
  prevC.width = tw * n + GAP * (n - 1); prevC.height = th;
  const pg = prevC.getContext("2d");
  pg.clearRect(0, 0, prevC.width, prevC.height);
  boxes.forEach(([x0], i) => {
    pg.save();
    pg.translate(i * (tw + GAP), 0);
    pg.beginPath(); pg.rect(0, 0, tw, th); pg.clip();
    pg.scale(tw / sw, th / p.h);
    pg.translate(-x0, 0);
    drawFitted(pg, p);
    pg.restore();
  });

  let msg = t("sf.loaded", { name: state.file.name, w: b.width, h: b.height, n, sw, sh: p.h });
  if (b.width * b.height > S.LARGE_WARN_PIXELS) msg += " · ⚠ " + t("sf.large", { mp: Math.round((b.width * b.height) / 1e6) });
  if (cropMode && (p.w !== b.width || p.h !== b.height)) msg += " · " + t("sf.kept", { pct: Math.round((100 * p.w * p.h) / (b.width * b.height)) });
  setStatus(msg);
}

// ------------------------------------------------------------------ export
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));

async function makeStrip(p, box, optimize) {
  const sw = box[2] - box[0];
  let [w, h] = optimize ? S.fitWithin(sw, p.h, S.X_MAX_SIDE) : [sw, p.h];
  for (;;) {
    const c = canvas(w, h);
    const g = c.getContext("2d");
    if (optimize) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.imageSmoothingQuality = "high";
    g.scale(w / sw, h / p.h);
    g.translate(-box[0], 0);
    drawFitted(g, p);
    if (!optimize) return toBlob(c, "image/png");
    // Binary search over the quality list: best quality that fits.
    let lo = 0, hi = S.JPEG_QUALITIES.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const blob = await toBlob(c, "image/jpeg", S.JPEG_QUALITIES[mid]);
      if (blob.size <= S.X_MAX_BYTES) { best = blob; hi = mid - 1; } else lo = mid + 1;
    }
    if (best) return best;
    w = Math.max(1, Math.floor((w * 3) / 4)); h = Math.max(1, Math.floor((h * 3) / 4));
  }
}

async function* strips() {
  const n = count(), b = state.bmp;
  const p = S.plan(b.width, b.height, n, ratio(), state.fit);
  const boxes = S.stripBoxes(p.w, p.h, n);
  const optimize = $("optimize").checked, ext = optimize ? "jpg" : "png";
  for (let i = 0; i < n; i++) {
    if (state.cancel) { const err = new Error("cancelled"); err.name = "Cancelled"; err.done = i; err.total = n; throw err; }
    setStatus(t("sf.working", { i: i + 1, n }));
    $("bar").firstElementChild.style.width = `${(100 * i) / n}%`;
    yield { name: S.stripName(i + 1, n, ext), blob: await makeStrip(p, boxes[i], optimize) };
    await new Promise((r) => setTimeout(r)); // keep the page responsive
  }
}

async function run(kind) {
  if (!state.bmp || state.busy) return;
  state.busy = true;
  state.cancel = false;
  for (const id of ["save", "save-dir"]) $(id).disabled = true;
  $("bar").hidden = false;
  $("cancel").hidden = false;
  try {
    const base = S.safeName(state.name);
    if (kind === "dir") {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      let dirName = base, k = 2;
      for (;;) { try { await root.getDirectoryHandle(dirName); dirName = `${base}_${k++}`; } catch { break; } }
      const dir = await root.getDirectoryHandle(dirName, { create: true });
      let n = 0;
      for await (const f of strips()) {
        const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
        await w.write(f.blob); await w.close(); n++;
      }
      setStatus(t("sf.saved", { n, path: `${root.name}/${dirName}` }));
    } else {
      const files = [];
      for await (const f of strips()) files.push({ name: `${base}/${f.name}`, data: new Uint8Array(await f.blob.arrayBuffer()) });
      const url = URL.createObjectURL(new Blob([S.makeZip(files)], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${base}.zip` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(t("sf.zipped", { file: `${base}.zip` }));
    }
    window.Site.toast(document.getElementById("status").textContent);
  } catch (e) {
    if (e.name === "Cancelled") setStatus(t("sf.cancelled", { n: e.done, total: e.total }));
    else if (e.name !== "AbortError") setStatus(t("sf.error", { err: e.message }), true);
    else render();
  } finally {
    state.busy = false;
    $("bar").hidden = true;
    $("cancel").hidden = true;
    for (const id of ["save", "save-dir"]) $(id).disabled = !state.bmp;
    $("save").focus();
  }
}

// ------------------------------------------------------------------ loading
async function load(file) {
  if (!file) return;
  if (file.size === 0) { setStatus(t("sf.empty"), true); return; }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const px = bmp.width * bmp.height;
    if (px > S.MAX_PIXELS) {
      bmp.close();
      setStatus(t("sf.tooLarge", { mp: Math.round(px / 1e6) }), true);
      return;
    }
    state.bmp?.close?.();
    Object.assign(state, { file, bmp, name: file.name.replace(/\.[^.]+$/, "") || "image" });
    blurBg = null;
    $("file-name").textContent = file.name;
    $("file-name").title = file.name;
    $("save").disabled = false; $("save-dir").disabled = false;
    autoCount();
  } catch {
    setStatus(t("sf.notImage"), true);
  }
}

// ------------------------------------------------------------------ wiring
function wire() {
  const drop = $("drop");
  $("file").addEventListener("change", async (e) => { await load(e.target.files[0]); e.target.value = ""; $("browse").focus(); });
  $("browse").addEventListener("click", () => $("file").click());
  $("cancel").addEventListener("click", () => { state.cancel = true; });
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); load(e.dataTransfer.files[0]); });
  window.addEventListener("paste", (e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) load(f); });

  $("count").addEventListener("change", render);
  $("minus").addEventListener("click", () => { $("count").value = count() - 1; render(); });
  $("plus").addEventListener("click", () => { $("count").value = count() + 1; render(); });
  $("auto").addEventListener("click", autoCount);
  $("fit").addEventListener("change", () => { state.fit = $("fit").value; render(); });
  $("zoom").addEventListener("change", render);
  $("save").addEventListener("click", () => run("zip"));
  $("save-dir").addEventListener("click", () => run("dir"));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.busy) { state.cancel = true; return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "o") { e.preventDefault(); $("file").click(); }
    if (e.key === "s") { e.preventDefault(); $("save").click(); }
  });
  let job; new ResizeObserver(() => { clearTimeout(job); job = setTimeout(render, 120); }).observe($("src-scroll"));
  for (const id of ["src-scroll", "prev-scroll"]) $(id).addEventListener("wheel", (e) => {
    if (e.shiftKey && !e.deltaX) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; }
  }, { passive: false });
}

if ("showDirectoryPicker" in window) $("save-dir").hidden = false;
wire();
window.Site.onChange(applyLang);
// Test hook, only with #selftest.
if (location.hash === "#selftest") window.scrollfold = { load, strips, state, count };

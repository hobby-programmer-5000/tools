// Scrollfold web UI. Works as a static page (zip download) or with server.py (saves to output/).
import * as S from "./split.js";
import { t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const GAP = 6;
const LINE = "#ff4040";
const ZOOMS = ["fit", 10, 25, 50, 100, 200];
const MAX_VIEW = 16000; // canvas side cap for previews

const state = {
  lang: (() => { try { return localStorage.getItem("scrollfold.lang") || (navigator.language.startsWith("ko") ? "ko" : "en"); } catch { return "en"; } })(),
  file: null, bmp: null, name: "", ratioKey: S.DEFAULT_RATIO, fit: S.DEFAULT_FIT,
  server: null, // {token, output} when served by server.py
  resultId: null, busy: false,
};

// ------------------------------------------------------------------ text
function applyLang() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(state.lang, el.dataset.i18n);
  $("repo-link").title = t(state.lang, "repo_title");
  $("lang-btn").textContent = t(state.lang, "lang");
  $("mode").textContent = t(state.lang, state.server ? "mode_server" : "mode_static");
  $("save").textContent = t(state.lang, state.server ? "save_server" : "save_zip");
  $("accepts").textContent = t(state.lang, state.server ? "accepts_server" : "accepts_static");
  buildRatio();
  const fit = $("fit");
  fit.replaceChildren(...S.FIT_MODES.map((m) => new Option(t(state.lang, "fit_" + m), m, false, m === state.fit)));
  const zoom = $("zoom"), cur = zoom.value || "fit";
  zoom.replaceChildren(...ZOOMS.map((z) => new Option(z === "fit" ? t(state.lang, "fit") : `${z}%`, String(z), false, String(z) === cur)));
  render();
}

function buildRatio() {
  const box = $("ratio");
  box.replaceChildren(...Object.keys(S.RATIOS).map((k) => {
    const label = document.createElement("label");
    const input = Object.assign(document.createElement("input"), { type: "radio", name: "ratio", value: k, checked: k === state.ratioKey });
    input.addEventListener("change", () => { state.ratioKey = k; autoCount(); });
    const span = document.createElement("span");
    span.textContent = k === "original" ? t(state.lang, "ratio_original") : k;
    const small = document.createElement("small");
    small.textContent = t(state.lang, "hint_" + k);
    span.append(small);
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

// Draw the fitted image (what gets split) into ctx, in fitted coordinates.
let blurBg = null; // small blurred cover image, cached per (image, plan size)
function drawFitted(ctx, p) {
  const b = state.bmp;
  if (state.fit !== "crop" && ratio()) {
    if (state.fit === "blur") {
      const key = `${p.w}x${p.h}`;
      if (!blurBg || blurBg.key !== key) {
        const s = Math.max(p.w / b.width, p.h / b.height);
        const bw = Math.max(p.w, Math.round(b.width * s)), bh = Math.max(p.h, Math.round(b.height * s));
        const c = new OffscreenCanvasOr(Math.max(1, bw >> 3), Math.max(1, bh >> 3));
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
function OffscreenCanvasOr(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function scaleFor(w, h, scroller, extraW = 0) {
  const z = $("zoom").value;
  let s;
  if (z === "fit" || !z) s = Math.min((scroller.clientWidth - extraW - 2) / w, (scroller.clientHeight - 2) / h);
  else s = Number(z) / 100;
  return Math.max(0.001, Math.min(s, MAX_VIEW / Math.max(w, h)));
}

// ------------------------------------------------------------------ render previews
function render() {
  const srcC = $("src-canvas"), prevC = $("prev-canvas");
  if (!state.bmp) { srcC.width = srcC.height = prevC.width = prevC.height = 0; return; }
  state.fit = $("fit").value || state.fit;
  const n = count(), r = ratio(), b = state.bmp;
  let p, boxes;
  try {
    p = S.plan(b.width, b.height, n, r, state.fit);
    boxes = S.stripBoxes(p.w, p.h, n);
  } catch (e) { setStatus(e instanceof S.SplitError ? t(state.lang, e.kind, e.info) : e.message, true); return; }

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

  let msg = t(state.lang, "loaded", { name: state.file.name, w: b.width, h: b.height, n, sw, sh: p.h });
  if (b.width * b.height > S.LARGE_WARN_PIXELS) msg += " · ⚠ " + t(state.lang, "large", { mp: Math.round((b.width * b.height) / 1e6) });
  if (cropMode && (p.w !== b.width || p.h !== b.height)) msg += " · " + t(state.lang, "kept", { pct: Math.round((100 * p.w * p.h) / (b.width * b.height)) });
  setStatus(msg);
}

// ------------------------------------------------------------------ export
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));

async function makeStrip(p, box, optimize) {
  const sw = box[2] - box[0];
  let [w, h] = optimize ? S.fitWithin(sw, p.h, S.X_MAX_SIDE) : [sw, p.h];
  for (;;) {
    const c = OffscreenCanvasOr(w, h);
    const g = c.getContext("2d");
    if (optimize) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.imageSmoothingQuality = "high";
    g.scale(w / sw, h / p.h);
    g.translate(-box[0], 0);
    drawFitted(g, p);
    if (!optimize) return toBlob(c, "image/png");
    // Binary search over the quality list: best quality that fits, in ~4 encodes instead of up to 10.
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
    setStatus(t(state.lang, "working", { i: i + 1, n }));
    $("progress").value = i / n;
    yield { name: S.stripName(i + 1, n, ext), blob: await makeStrip(p, boxes[i], optimize) };
    await new Promise((r) => setTimeout(r)); // keep the page responsive
  }
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "X-Scrollfold-Token": state.server.token, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function run(kind) {
  if (!state.bmp || state.busy) return;
  state.busy = true;
  state.cancel = false;
  let folderShown = "";
  for (const id of ["save", "save-dir"]) $(id).disabled = true;
  $("progress").hidden = false;
  $("cancel").hidden = false;
  try {
    const base = S.safeName(state.name);
    if (kind === "server") {
      // The folder is created when the first strip is ready, so cancelling early leaves nothing behind.
      let job = null, n = 0;
      for await (const f of strips()) {
        if (!job) {
          job = await api("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: base }) });
          folderShown = job.folder;
          state.resultId = job.id;
          $("open-folder").disabled = false;
        }
        await api(`/api/jobs/${job.id}/${f.name}`, { method: "PUT", body: f.blob });
        n++;
      }
      state.resultId = job.id;
      $("open-folder").disabled = false;
      setStatus(t(state.lang, "saved", { n, path: job.folder }));
    } else if (kind === "dir") {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      let dirName = base, k = 2;
      for (;;) { try { await root.getDirectoryHandle(dirName); dirName = `${base}_${k++}`; } catch { break; } }
      const dir = await root.getDirectoryHandle(dirName, { create: true });
      folderShown = `${root.name}/${dirName}`;
      let n = 0;
      for await (const f of strips()) {
        const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
        await w.write(f.blob); await w.close(); n++;
      }
      setStatus(t(state.lang, "saved", { n, path: `${root.name}/${dirName}` }));
    } else {
      const files = [];
      for await (const f of strips()) files.push({ name: `${base}/${f.name}`, data: new Uint8Array(await f.blob.arrayBuffer()) });
      const url = URL.createObjectURL(new Blob([S.makeZip(files)], { type: "application/zip" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${base}.zip` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(t(state.lang, "zipped", { file: `${base}.zip` }));
    }
  } catch (e) {
    if (e.name === "Cancelled") {
      const where = e.done && folderShown ? t(state.lang, "cancelled_where", { path: folderShown }) : "";
      setStatus(t(state.lang, "cancelled", { n: e.done, total: e.total, where }));
    } else if (e.name !== "AbortError") setStatus(t(state.lang, "error", { err: e.message }), true);
    else render();
  } finally {
    state.busy = false;
    $("progress").hidden = true;
    $("cancel").hidden = true;
    for (const id of ["save", "save-dir"]) $(id).disabled = !state.bmp;
    $("save").focus(); // after re-enabling, or focus is lost
  }
}

// ------------------------------------------------------------------ loading
async function load(file) {
  if (!file) return;
  if (file.size === 0) { setStatus(t(state.lang, "empty"), true); return; }
  try {
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch (err) {
      // TIFF, TGA, JPEG 2000, ... : browsers can't decode them, but the local server (Pillow) can.
      if (!state.server) throw err;
      const res = await fetch("/api/decode", { method: "POST", headers: { "X-Scrollfold-Token": state.server.token }, body: file });
      if (!res.ok) throw new Error(await res.text());
      bmp = await createImageBitmap(await res.blob());
    }
    const px = bmp.width * bmp.height;
    if (px > S.MAX_PIXELS) {
      bmp.close();
      setStatus(t(state.lang, "too_large", { mp: Math.round(px / 1e6) }), true);
      return;
    }
    state.bmp?.close?.();
    Object.assign(state, { file, bmp, name: file.name.replace(/\.[^.]+$/, "") || "image", resultId: null });
    blurBg = null;
    $("file-name").textContent = file.name;
    $("file-name").title = file.name; // full name on hover; CSS truncates long names
    $("save").disabled = false; $("save-dir").disabled = false; $("open-folder").disabled = true;
    autoCount();
  } catch {
    setStatus(t(state.lang, state.server ? "not_image" : "not_image_static"), true);
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
  $("save").addEventListener("click", () => run(state.server ? "server" : "zip"));
  $("save-dir").addEventListener("click", () => run("dir"));
  $("open-folder").addEventListener("click", () => state.resultId && api(`/api/jobs/${state.resultId}/open`, { method: "POST" }).catch((e) => setStatus(e.message, true)));
  $("lang-btn").addEventListener("click", () => { state.lang = state.lang === "en" ? "ko" : "en"; try { localStorage.setItem("scrollfold.lang", state.lang); } catch {} applyLang(); });
  $("credits-btn").addEventListener("click", () => $("credits").showModal());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.busy) { state.cancel = true; return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "o") { e.preventDefault(); $("file").click(); }
    if (e.key === "s") { e.preventDefault(); $("save").click(); }
  });
  let job; new ResizeObserver(() => { clearTimeout(job); job = setTimeout(render, 120); }).observe($("src-scroll"));
  // Shift+wheel scrolls sideways on platforms that don't do it already.
  for (const id of ["src-scroll", "prev-scroll"]) $(id).addEventListener("wheel", (e) => {
    if (e.shiftKey && !e.deltaX) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; }
  }, { passive: false });
}

async function init() {
  try {
    const res = await fetch("/api/info");
    if (res.ok) state.server = await res.json();
  } catch { /* static hosting */ }
  if (state.server) $("open-folder").hidden = false;
  if (!state.server && "showDirectoryPicker" in window) $("save-dir").hidden = false;
  wire();
  applyLang();
}
const ready = init();
// Test hook for web/selftest.html: only exposed when the page is opened with #selftest, after init finished.
if (location.hash === "#selftest") ready.then(() => { window.scrollfold = api_; });
const api_ = { load, strips, state, count, setFit: (m) => { state.fit = m; $("fit").value = m; } };

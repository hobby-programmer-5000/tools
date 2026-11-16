// Meme Maker page: draws the document that meme.js describes, and turns pointer and keyboard input into edits.
// Pictures are read in this browser only. Templates are kept in this browser's IndexedDB. No network requests.
import * as M from "./meme.js";

const $ = (id) => document.getElementById(id);
const t = (k, v) => window.Site.t(k, v);
const cv = $("cv"), ctx = cv.getContext("2d", { willReadFrequently: true });
const ov = $("ov"), octx = ov.getContext("2d");
const MAX_PIXELS = 400e6;        // same cap as the other image tools on this site
const HANDLE = 9, GRAB = 16, ROT_GAP = 28;   // display pixels

const assets = new Map();        // id -> canvas of source pixels; never changed once made
let assetSeq = 0;
const hist = new M.History();
let doc = null;                  // { W, H, padTop, padBottom, bg, layers, seq }
let sel = null;                  // id of the selected layer
let tool = "select";
const opt = { penColor: "#111111", penSize: 6, shape: "ellipse", brush: 40, feather: 8 };
let drag = null;                 // the pointer interaction in progress
let hover = null;                // pointer position in canvas pixels, for brush cursors
let penLayer = null;             // ink layer the pen is adding to
let status = null;

// ------------------------------------------------------------------ small helpers
const byId = (id) => doc && doc.layers.find((L) => L.id === id);
const selected = () => (sel ? byId(sel) : null);
const unit = () => Math.max(doc.W, doc.H) / 1000;       // slider units to canvas pixels
const nextId = () => "L" + doc.seq++;
const editing = (el) => el && el.closest && el.closest("input, textarea, select, [contenteditable]");

function setStatus(key, vars, error = false) {
  status = key ? { key, vars, error } : null;
  $("status").textContent = key ? t(key, vars) : "";
  $("status").classList.toggle("error", error);
}
function addAsset(canvas) { const id = "a" + ++assetSeq; assets.set(id, canvas); return id; }

let queued = false;
function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } }
function changed() { schedule(); syncPanels(); }
function commit() { clearTimeout(nudgeTimer); nudgeTimer = 0; hist.push(doc); pruneAssets(); syncUndo(); changed(); }
// Arrow-key moves are saved as one history step per burst of presses, 400 ms after the last one.
let nudgeTimer = 0;
function flushNudge() { if (nudgeTimer) commit(); }
/** Forget pictures that no history step uses any more (history keeps at most HISTORY_LIMIT steps). */
function pruneAssets() {
  const used = new Set(), ids = new Set();
  for (const d of hist.stack) for (const L of d.layers) { if (L.src) used.add(L.src); ids.add(L.id); }
  for (const id of assets.keys()) if (!used.has(id)) assets.delete(id);
  for (const id of bitmaps.keys()) if (!ids.has(id)) bitmaps.delete(id);
}

// ------------------------------------------------------------------ loading pictures

/** Decode a file or blob into a canvas whose long side is at most max. Reports errors in the status line. */
async function readPicture(blob, max, maxArea) {
  if (!blob) return null;
  if (blob.size === 0) { setStatus("mm.emptyFile", null, true); return null; }
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch { setStatus("mm.notImage", null, true); return null; }
  if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close(); setStatus("mm.tooLarge", { mp: Math.round(bmp.width * bmp.height / 1e6) }, true); return null; }
  const [w, h] = M.fitSize(bmp.width, bmp.height, max, maxArea);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, h);
  c.srcW = bmp.width; c.srcH = bmp.height;
  bmp.close();
  return c;
}

function imageLayer(src, c, box, extra = {}, id = nextId()) {
  return { id, kind: "image", src, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0, flip: false, opacity: 1,
    crop: { x: 0, y: 0, w: c.width, h: c.height }, clips: [], holes: [], locked: false, hidden: false, ...extra };
}

function startDoc(d) {
  if (drag) revertDrag();
  const had = !!doc;
  doc = d; sel = null; penLayer = null; drag = null;
  if (had) hist.push(doc); else hist.reset(doc);
  $("studio").hidden = false;
  setTool("select");
  syncUndo(); render(); syncPanels();
  $("studio").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function openBaseCanvas(c) {
  const src = addAsset(c);
  const d = { W: c.width, H: c.height, padTop: 0, padBottom: 0, bg: "#ffffff", layers: [], seq: 2 };
  d.layers.push(imageLayer(src, c, { x: c.width / 2, y: c.height / 2, w: c.width, h: c.height }, { base: true, locked: true }, "L1"));
  startDoc(d);
  const scaled = c.srcW !== c.width;
  setStatus(scaled ? "mm.openedScaled" : "mm.opened", { w: c.srcW, h: c.srcH, pw: c.width, ph: c.height });
}
async function openBase(blob) { const c = await readPicture(blob, M.MAX_BASE, M.MAX_AREA); if (c) openBaseCanvas(c); }

function openBlank() {
  const [w, h] = $("blank-size").value.split("x").map(Number);
  startDoc({ W: w, H: h, padTop: 0, padBottom: 0, bg: $("blank-color").value, layers: [], seq: 1 });
  setStatus("mm.blankMade", { w, h });
}

function addPhotoCanvas(c, extra = {}) {
  if (drag) revertDrag();
  const body = doc.H - doc.padTop - doc.padBottom;
  const k = Math.min(1, (Math.min(doc.W, body) * 0.5) / Math.max(c.width, c.height));
  const L = imageLayer(addAsset(c), c, { x: doc.W / 2, y: doc.padTop + body / 2, w: c.width * k, h: c.height * k }, extra);
  doc.layers.push(L); sel = L.id;
  setTool("select");
  commit();
  return L;
}
async function addPhoto(blob) {
  if (!doc) return openBase(blob);
  const c = await readPicture(blob, M.MAX_PHOTO);
  if (c) { addPhotoCanvas(c); setStatus("mm.photoAdded"); }
}

async function addBelow(blob) {
  const c = await readPicture(blob, M.MAX_BASE);
  if (!c || !doc) return;
  if (drag) revertDrag();
  const { doc: d, box } = M.attachBelow(doc, c.width, c.height);
  doc = d;
  doc.layers.push(imageLayer(addAsset(c), c, box, { panel: true, locked: true }));
  commit(); render();
  setStatus("mm.belowAdded", { w: doc.W, h: doc.H });
}

// ------------------------------------------------------------------ text

function addText(extra = {}) {
  const body = doc.H - doc.padTop - doc.padBottom;
  const n = doc.layers.filter((L) => L.kind === "text" && !L.caption).length;
  const y = doc.padTop + body * (n === 0 ? 0.12 : n === 1 ? 0.88 : 0.5);
  const L = {
    id: nextId(), kind: "text", text: t("mm.sampleText"), x: doc.W / 2, y, w: doc.W * 0.92, h: Math.max(M.MIN_BOX * 3, body * 0.22),
    rot: 0, flip: false, opacity: 1, font: window.Site.lang === "ko" ? "gothic" : "impact",
    size: Math.min(400, Math.round(Math.min(doc.W, body) / 7)), fill: "#ffffff", stroke: "#000000", strokeW: 0.06, align: "center", caps: false,
    locked: false, hidden: false, ...extra,
  };
  doc.layers.push(L); sel = L.id;
  setTool("select");
  commit();
  const ta = $("text-input");
  ta.focus({ preventScroll: true }); ta.select();
  return L;
}

const mctx = document.createElement("canvas").getContext("2d");
const measureAt = (font) => (size) => { const css = M.fontCss(font, size); return (s) => { mctx.font = css; return mctx.measureText(s).width; }; };

function drawText(c, L) {
  const text = L.caps ? L.text.toUpperCase() : L.text;
  const fit = M.fitText(text, L.w, L.h, L.size, measureAt(L.font), L.strokeW);
  c.font = M.fontCss(L.font, fit.size);
  c.textBaseline = "middle"; c.textAlign = L.align; c.lineJoin = "round"; c.miterLimit = 2;
  const lh = fit.size * M.LINE_HEIGHT, top = -fit.lines.length * lh / 2, pad = L.strokeW * fit.size;
  const x = L.align === "left" ? -L.w / 2 + pad : L.align === "right" ? L.w / 2 - pad : 0;
  fit.lines.forEach((line, i) => {
    const y = top + lh * (i + 0.5);
    if (L.strokeW > 0) { c.lineWidth = 2 * L.strokeW * fit.size; c.strokeStyle = L.stroke; c.strokeText(line, x, y); }
    c.fillStyle = L.fill; c.fillText(line, x, y);
  });
}

// ------------------------------------------------------------------ drawing

function shapePath(g, sh) {
  g.beginPath();
  if (sh.type === "ellipse") g.ellipse(sh.cx, sh.cy, Math.max(0.5, sh.rx), Math.max(0.5, sh.ry), 0, 0, Math.PI * 2);
  else if (sh.type === "poly") { sh.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  else smoothPath(g, sh.pts);
}
function smoothPath(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) { g.lineTo(pts[0][0] + 0.01, pts[0][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}
/** Paint a shape in black on a mask. A soft edge comes from the shadow of a copy drawn off the canvas. */
function paintShape(g, sh, k) {
  g.save();
  g.fillStyle = g.strokeStyle = "#000";
  if (sh.feather > 0) {
    const off = g.canvas.width + g.canvas.height + sh.feather * k * 4 + 100;
    g.shadowColor = "#000"; g.shadowBlur = sh.feather * k; g.shadowOffsetX = off;
    g.translate(-off / k, 0);
  }
  shapePath(g, sh);
  if (sh.type === "stroke") { g.lineWidth = 2 * sh.r; g.lineCap = g.lineJoin = "round"; g.stroke(); } else g.fill();
  g.restore();
}

const bitmaps = new Map();       // layer id -> { key, c }: the layer's pixels after cut-out and holes
function layerBitmap(L) {
  const key = JSON.stringify([L.src, L.crop, L.clips, L.holes]);
  const hit = bitmaps.get(L.id);
  if (hit && hit.key === key) return hit.c;
  const a = assets.get(L.src);
  if (!a) return null;
  const w = Math.max(1, Math.round(L.crop.w)), h = Math.max(1, Math.round(L.crop.h));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(a, L.crop.x, L.crop.y, L.crop.w, L.crop.h, 0, 0, w, h);
  const kx = w / L.crop.w, ky = h / L.crop.h;
  const mask = (shapes, op) => {
    const m = document.createElement("canvas"); m.width = w; m.height = h;
    const mg = m.getContext("2d");
    mg.setTransform(kx, 0, 0, ky, -L.crop.x * kx, -L.crop.y * ky);
    for (const sh of shapes) paintShape(mg, sh, kx);
    g.globalCompositeOperation = op; g.drawImage(m, 0, 0); g.globalCompositeOperation = "source-over";
  };
  for (const clip of L.clips) mask([clip], "destination-in");   // each cut narrows what is kept
  if (L.holes.length) mask(L.holes, "destination-out");
  bitmaps.set(L.id, { key, c });
  return c;
}

function drawLayer(c, L) {
  c.save();
  c.translate(L.x, L.y); c.rotate(L.rot || 0);
  if (L.flip) c.scale(-1, 1);
  c.globalAlpha = L.opacity ?? 1;
  if (L.kind === "image") { const b = layerBitmap(L); if (b) c.drawImage(b, -L.w / 2, -L.h / 2, L.w, L.h); }
  else if (L.kind === "patch") { c.fillStyle = L.color; c.fillRect(-L.w / 2, -L.h / 2, L.w, L.h); }
  else if (L.kind === "text") drawText(c, L);
  else if (L.kind === "ink") {
    c.scale(L.w / L.crop.w, L.h / L.crop.h);
    c.translate(-L.crop.x - L.crop.w / 2, -L.crop.y - L.crop.h / 2);
    c.strokeStyle = c.fillStyle = L.color; c.lineCap = c.lineJoin = "round";
    for (const s of L.strokes) { c.lineWidth = s.w; c.beginPath(); smoothPath(c, s.pts); c.stroke(); }
  }
  c.restore();
}

/** Draw the whole document into context c. keep(L) can leave layers out. The band color fills the caption
 *  bands, and the whole canvas only when there is no background picture: a hole with nothing behind it stays
 *  see-through, on screen, in the PNG and in a saved template. */
function drawDoc(c, d, keep = () => true) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, d.W, d.H);
  c.fillStyle = d.bg;
  if (!d.layers.some((L) => L.base)) c.fillRect(0, 0, d.W, d.H);
  else { c.fillRect(0, 0, d.W, d.padTop); c.fillRect(0, d.H - d.padBottom, d.W, d.padBottom); }
  for (const L of d.layers) if (!L.hidden && keep(L)) drawLayer(c, L);
}

let laidOut = "";
function render() {
  if (!doc) return;
  if (laidOut !== doc.W + "x" + doc.H) {
    laidOut = doc.W + "x" + doc.H;
    cv.width = doc.W; cv.height = doc.H;
    $("stage").style.setProperty("--ar", doc.W / doc.H);
    $("dims").textContent = `${doc.W} × ${doc.H} px`;
    sizeOverlay();
  }
  drawDoc(ctx, doc);
  drawOverlay();
}

// ------------------------------------------------------------------ overlay: selection, handles, previews

let scale = 1;                   // display pixels per canvas pixel
function sizeOverlay() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width || !doc) return;
  scale = r.width / doc.W;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
}
const D = ([x, y]) => [x * scale, y * scale];

function drawOverlay() {
  octx.save(); octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.width, ov.height); octx.restore();
  if (!doc) return;
  const L = selected();
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim() || "#c08cff";
  if (L && !L.hidden && tool === "select") {
    const pts = M.corners(L).map(D);
    octx.lineWidth = 1.5; octx.strokeStyle = accent;
    octx.setLineDash(L.locked ? [5, 4] : []);
    octx.beginPath(); pts.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y))); octx.closePath(); octx.stroke();
    octx.setLineDash([]);
    if (!L.locked) {
      const side = rotBelow(L) ? 1 : -1;
      const [tx, ty] = D(M.toCanvas(L, 0, side * L.h / 2)), [rx, ry] = D(M.toCanvas(L, 0, side * (L.h / 2 + ROT_GAP / scale)));
      octx.beginPath(); octx.moveTo(tx, ty); octx.lineTo(rx, ry); octx.stroke();
      octx.fillStyle = "#fff";
      octx.beginPath(); octx.arc(rx, ry, HANDLE / 2 + 1, 0, Math.PI * 2); octx.fill(); octx.stroke();
      for (const [x, y] of pts) { octx.fillRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE); octx.strokeRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE); }
    }
  }
  // Previews of the shape being drawn.
  octx.strokeStyle = "#fff"; octx.lineWidth = 1.5;
  const outline = (draw) => { octx.save(); octx.shadowColor = "rgba(0,0,0,.8)"; octx.shadowBlur = 3; draw(); octx.restore(); };
  if (drag && drag.type === "box") outline(() => {
    const T = drag.target, [cx, cy] = D(M.toCanvas(T, drag.u, drag.v));
    octx.beginPath();
    if (drag.shape === "rect") [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => D(M.toCanvas(T, drag.u + a * drag.ru, drag.v + b * drag.rv))).forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y)));
    else octx.ellipse(cx, cy, Math.abs(drag.ru) * scale, Math.abs(drag.rv) * scale, T.rot || 0, 0, Math.PI * 2);
    octx.closePath(); octx.stroke();
  });
  if (drag && drag.type === "erase") {
    octx.save();
    octx.strokeStyle = "rgba(255, 111, 174, .6)"; octx.lineWidth = Math.max(2, opt.brush * unit() * scale); octx.lineCap = octx.lineJoin = "round";
    octx.beginPath(); smoothPath(octx, drag.pts.map(D)); octx.stroke();
    octx.restore();
  }
  if (drag && drag.type === "lasso") outline(() => {
    octx.setLineDash([6, 4]); octx.beginPath(); drag.pts.map(D).forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y))); octx.stroke();
  });
  if (drag && drag.type === "cover") outline(() => {
    const [x0, y0] = D(drag.a), [x1, y1] = D(drag.b);
    octx.setLineDash([6, 4]); octx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  });
  const brushR = tool === "pen" ? opt.penSize * unit() / 2 : tool === "hole" && opt.shape === "brush" ? opt.brush * unit() / 2 : 0;
  if (hover && brushR) outline(() => { const [x, y] = D(hover); octx.beginPath(); octx.arc(x, y, Math.max(2, brushR * scale), 0, Math.PI * 2); octx.stroke(); });
}

// ------------------------------------------------------------------ pointer input

function canvasPoint(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * doc.W / r.width, (e.clientY - r.top) * doc.H / r.height];
}
/** Topmost visible layer under the point. images: only image layers. withLocked: include locked ones. */
function layerAt(x, y, { images = false, withLocked = false } = {}) {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i];
    if (L.hidden || (L.locked && !withLocked) || (images && L.kind !== "image")) continue;
    if (M.contains(L, x, y)) return L;
  }
  return null;
}

/** Grab radius for a layer's handles in canvas pixels: smaller on small layers, so their body can still be dragged. */
const grabFor = (L) => Math.max(4, Math.min(GRAB, (Math.min(L.w, L.h) * scale) / 3)) / scale;
/** The rotate handle goes below the box when above it would be off the canvas (a top text box, say). */
function rotBelow(L) {
  const [x, y] = M.toCanvas(L, 0, -L.h / 2 - ROT_GAP / scale);
  return x < 0 || y < 0 || x > doc.W || y > doc.H;
}

function onDown(e) {
  if (!doc || (e.button !== undefined && e.button !== 0)) return;
  if (drag) { if (e.pointerId !== drag.pointerId) revertDrag(); return; }   // a second finger cancels, it never steers
  flushNudge();
  e.preventDefault();
  // preventDefault keeps focus where it was; let a field in the side panel finish (and commit) its edit first.
  if (document.activeElement && $("props").contains(document.activeElement)) document.activeElement.blur();
  const [x, y] = canvasPoint(e);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;   // the canvas has no size on screen yet
  try { ov.setPointerCapture(e.pointerId); } catch {}
  const start = { pointerId: e.pointerId, tool };
  if (tool === "select") {
    const L = selected();
    if (L && !L.locked && !L.hidden) {
      const h = M.handleAt(L, x, y, grabFor(L), ROT_GAP / scale, rotBelow(L));
      if (h) { drag = { ...start, type: h === "rot" ? "rot" : "resize", handle: h, below: rotBelow(L), L0: structuredClone(L), moved: false }; return; }
    }
    const hit = layerAt(x, y);
    sel = hit ? hit.id : null;
    drag = hit ? { ...start, type: "move", x, y, L0: structuredClone(hit), moved: false } : null;
    changed();
    return;
  }
  if (tool === "pen") {
    let L = penLayer && byId(penLayer);
    // Keep adding to the same pen layer only while nothing has moved, scaled, hidden or locked it.
    const plain = L && L.kind === "ink" && !L.hidden && !L.locked && !L.rot && !L.flip
      && Math.abs(L.w - L.crop.w) < 1e-6 && Math.abs(L.h - L.crop.h) < 1e-6
      && Math.abs(L.x - (L.crop.x + L.crop.w / 2)) < 1e-6 && Math.abs(L.y - (L.crop.y + L.crop.h / 2)) < 1e-6;
    if (!plain) {
      L = { id: nextId(), kind: "ink", color: opt.penColor, strokes: [], x, y, w: 1, h: 1, rot: 0, flip: false, opacity: 1, crop: { x, y, w: 1, h: 1 }, locked: false, hidden: false };
      doc.layers.push(L); penLayer = L.id;
    }
    sel = L.id;
    const s = { w: opt.penSize * unit(), pts: [[x, y]] };
    L.strokes.push(s);
    drag = { ...start, type: "pen", L, s };
    fitInk(L); changed();
    return;
  }
  if (tool === "cover") { drag = { ...start, type: "cover", a: [x, y], b: [x, y] }; return; }
  // Hole and cut work on an image layer: the selected one, even if the shape starts outside it; else the topmost
  // one under the press. Cut never picks the locked background by itself (select it first to cut it).
  const S = selected();
  const target = S && S.kind === "image" && !S.hidden ? S : layerAt(x, y, { images: true, withLocked: tool === "hole" });
  if (!target) { setStatus(tool === "cut" ? "mm.needPhotoCut" : "mm.needPicture", null, true); return; }
  sel = target.id;
  const shape = tool === "cut" && opt.shape === "brush" ? "ellipse" : opt.shape;
  if (shape === "brush") drag = { ...start, type: "erase", target, pts: [[x, y]] };
  else if (shape === "lasso") drag = { ...start, type: "lasso", target, pts: [[x, y]] };
  else {
    const [u, v] = M.toLocal(target, x, y);
    drag = { ...start, type: "box", shape, target, u0: u, v0: v, u, v, ru: 0, rv: 0 };
  }
  changed();
}

function onMove(e) {
  if (!doc) return;
  if (drag && e.pointerId !== drag.pointerId) return;
  const [x, y] = canvasPoint(e);
  hover = [x, y];
  if (!drag) { if (tool === "pen" || tool === "hole") drawOverlay(); return; }
  e.preventDefault();
  const L = drag.L0 && byId(drag.L0.id);
  if (drag.type === "move" && L) {
    if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) * scale < 3) return;   // a click, not a drag
    drag.moved = true; L.x = drag.L0.x + x - drag.x; L.y = drag.L0.y + y - drag.y;
  } else if (drag.type === "resize" && L) {
    const keep = (L.kind === "image" || L.kind === "ink") !== e.shiftKey;
    Object.assign(L, M.resizeFrom(drag.L0, drag.handle, x, y, keep)); drag.moved = true;
  } else if (drag.type === "rot" && L) {
    L.rot = M.rotationTo(drag.L0, x, y, e.shiftKey, drag.below); drag.moved = true;
  } else if (drag.type === "pen") {
    const last = drag.s.pts[drag.s.pts.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) * scale >= 1.5) { drag.s.pts.push([x, y]); fitInk(drag.L); }
  } else if (drag.type === "cover") {
    drag.b = [x, y];
  } else if (drag.type === "lasso" || drag.type === "erase") {
    // The eraser is only previewed on the overlay while it moves; the hole is made once, on release.
    const last = drag.pts[drag.pts.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) * scale >= (drag.type === "erase" ? 2 : 3)) drag.pts.push([x, y]);
  } else if (drag.type === "box") {
    const [u, v] = M.toLocal(drag.target, x, y);
    let du = u - drag.u0, dv = v - drag.v0;
    if (e.shiftKey) { const m = Math.max(Math.abs(du), Math.abs(dv)); du = Math.sign(du || 1) * m; dv = Math.sign(dv || 1) * m; }
    Object.assign(drag, { u: drag.u0 + du / 2, v: drag.v0 + dv / 2, ru: du / 2, rv: dv / 2 });
  }
  if (drag.type === "lasso" || drag.type === "erase" || drag.type === "box" || drag.type === "cover") drawOverlay(); else schedule();
}

function onUp(e) {
  if (!drag || !doc || e.pointerId !== drag.pointerId) return;
  const d = drag; drag = null;
  try { ov.releasePointerCapture(e.pointerId); } catch {}
  if (e.type === "pointercancel") { revert(); return; }
  if (d.type === "move" || d.type === "resize" || d.type === "rot") { if (d.moved) commit(); else changed(); return; }
  if (d.type === "pen") { commit(); return; }
  if (d.type === "cover") return finishCover(d.a, d.b);
  const T = byId(d.target.id);
  if (!T) { changed(); return; }
  // Sizes in canvas pixels become source pixels; the mean of both scales keeps a stretched photo fair.
  const kx = T.crop.w / T.w, ky = T.crop.h / T.h, k = (kx + ky) / 2, feather = opt.feather * unit() * k;
  let sh = null;
  if (d.type === "erase") {
    sh = { type: "stroke", pts: d.pts.map(([x, y]) => M.toSource(T, x, y)), r: opt.brush * unit() / 2 * k, feather };
  } else if (d.type === "box" && Math.abs(d.ru) * scale > 2 && Math.abs(d.rv) * scale > 2) {
    if (d.shape === "rect") {
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => M.toSource(T, ...M.toCanvas(T, d.u + a * d.ru, d.v + b * d.rv)));
      sh = { type: "poly", pts, feather };
    } else {
      const [cx, cy] = M.toSource(T, ...M.toCanvas(T, d.u, d.v));
      sh = { type: "ellipse", cx, cy, rx: Math.abs(d.ru) * kx, ry: Math.abs(d.rv) * ky, feather };
    }
  } else if (d.type === "lasso" && d.pts.length >= 3) {
    sh = { type: "poly", pts: d.pts.map(([x, y]) => M.toSource(T, x, y)), feather };
  }
  if (!sh) { changed(); return; }
  if (d.tool === "hole") { T.holes = [...T.holes, sh]; commit(); setStatus("mm.holeDone"); return; }
  // Cut out: keep only what is inside every cut so far, and shrink the layer to it so it is easy to move.
  const box = M.intersect(M.shapeBounds(sh), T.crop);
  if (!box) { changed(); return; }
  doc.layers[doc.layers.indexOf(T)] = M.cropTo({ ...T, clips: [...T.clips, sh] }, box);
  if (tool === "cut") setTool("select");
  commit(); setStatus("mm.cutDone");
}

/** Drop the drag in progress and go back to the last saved state. */
function revertDrag() { drag = null; revert(); }

function fitInk(L) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of L.strokes) for (const [x, y] of s.pts) {
    x0 = Math.min(x0, x - s.w / 2); y0 = Math.min(y0, y - s.w / 2); x1 = Math.max(x1, x + s.w / 2); y1 = Math.max(y1, y + s.w / 2);
  }
  L.crop = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  Object.assign(L, { x: x0 + L.crop.w / 2, y: y0 + L.crop.h / 2, w: L.crop.w, h: L.crop.h });
}

// ------------------------------------------------------------------ cover old text

function sampleAround(rect, skipId) {
  let c = cv, g = ctx;
  if (skipId) {
    c = document.createElement("canvas"); c.width = doc.W; c.height = doc.H; g = c.getContext("2d", { willReadFrequently: true });
    drawDoc(g, doc, (L) => L.id !== skipId);
  } else drawDoc(ctx, doc);
  const ring = Math.max(2, Math.round(unit() * 3));
  const x0 = Math.max(0, Math.floor(rect.x - ring)), y0 = Math.max(0, Math.floor(rect.y - ring));
  const x1 = Math.min(doc.W, Math.ceil(rect.x + rect.w + ring)), y1 = Math.min(doc.H, Math.ceil(rect.y + rect.h + ring));
  if (x1 <= x0 || y1 <= y0) return "#ffffff";
  const img = g.getImageData(x0, y0, x1 - x0, y1 - y0);
  const rgb = M.borderAverage(img.data, img.width, img.height, { x: rect.x - x0, y: rect.y - y0, w: rect.w, h: rect.h }, ring);
  return rgb ? M.toHex(rgb) : "#ffffff";
}
function finishCover(a, b) {
  const rect = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  if (rect.w * scale < 4 || rect.h * scale < 4) { changed(); return; }
  const L = { id: nextId(), kind: "patch", color: sampleAround(rect), x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: rect.w, h: rect.h, rot: 0, flip: false, opacity: 1, locked: false, hidden: false };
  doc.layers.push(L); sel = L.id;
  commit(); setStatus("mm.coverDone");
}

// ------------------------------------------------------------------ handwriting from a photo

let ink = null;                  // { src canvas, data }
async function openInk(blob) {
  const c = await readPicture(blob, M.MAX_PHOTO);
  if (!c) return;
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  ink = { c, data };
  const pc = $("ink-cv"); pc.width = c.width; pc.height = c.height;
  $("ink-t").value = Math.min(250, M.otsu(data.data) + 20);
  previewInk();
  $("ink-dlg").showModal();
}
function inkPixels() { return M.extractInk(ink.data.data, +$("ink-t").value, 40, M.fromHex($("ink-c").value)); }
function previewInk() {
  if (!ink) return;
  const out = new ImageData(inkPixels(), ink.c.width, ink.c.height);
  $("ink-cv").getContext("2d").putImageData(out, 0, 0);
}
function addInk() {
  const px = inkPixels(), w = ink.c.width, h = ink.c.height;
  const box = M.alphaBounds(px, w, h);
  $("ink-dlg").close();
  if (!box) { setStatus("mm.inkEmpty", null, true); ink = null; return; }
  const full = document.createElement("canvas"); full.width = w; full.height = h;
  full.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
  const c = document.createElement("canvas"); c.width = box.w; c.height = box.h;
  c.getContext("2d").drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  ink = null;
  addPhotoCanvas(c, { handwriting: true });
  setStatus("mm.inkAdded");
}

// ------------------------------------------------------------------ side panel

const KIND = { text: "mm.kText", image: "mm.kPhoto", ink: "mm.kInk", patch: "mm.kPatch" };
function layerName(L) {
  if (L.kind === "text") return (L.text.split("\n").find((s) => s.trim()) || t("mm.kText")).slice(0, 40);
  if (L.base) return t("mm.kBase");
  if (L.panel) return t("mm.kPanel");
  if (L.handwriting) return t("mm.kHandwriting");
  return t(KIND[L.kind]);
}

let panelFor = null;   // id of the layer the property fields show
function syncPanels() {
  if (!doc) return;
  $("cap-top").checked = doc.padTop > 0; $("cap-bottom").checked = doc.padBottom > 0; $("bg").value = doc.bg;
  // Layers, top first.
  const ol = $("layers"), had = ol.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = had && (had.dataset.id ? `[data-id="${had.dataset.id}"]` : had.dataset.eye ? `[data-eye="${had.dataset.eye}"]` : null);
  ol.replaceChildren(...doc.layers.slice().reverse().map((L) => {
    const li = document.createElement("li");
    li.classList.toggle("on", L.id === sel);
    const b = document.createElement("button");
    b.type = "button"; b.className = "pick"; b.dataset.id = L.id;
    b.setAttribute("aria-pressed", L.id === sel);
    const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = t(KIND[L.kind]);
    const name = document.createElement("span"); name.className = "name"; name.textContent = layerName(L);
    b.append(tag, name);
    const eye = document.createElement("button");
    eye.type = "button"; eye.className = "eye"; eye.dataset.eye = L.id;
    eye.textContent = L.hidden ? t("mm.show") : t("mm.hide");
    eye.setAttribute("aria-label", (L.hidden ? t("mm.show") : t("mm.hide")) + ": " + layerName(L));
    li.append(b, eye);
    return li;
  }));
  if (!doc.layers.length) { const li = document.createElement("li"); li.className = "none muted small"; li.textContent = t("mm.noLayers"); ol.append(li); }
  if (focusKey) ol.querySelector(focusKey)?.focus({ preventScroll: true });   // the list was rebuilt; the same button keeps focus
  // Properties of the selected layer.
  const L = selected();
  $("props").hidden = !L;
  if (!L) { panelFor = null; return; }
  $("props-h").textContent = t("mm.selected") + ": " + t(KIND[L.kind]);
  for (const k of ["text", "image", "ink", "patch"]) $("p-" + k).hidden = L.kind !== k;
  const fresh = panelFor !== L.id;
  panelFor = L.id;
  const set = (id, v) => { const el = $(id); if (fresh || document.activeElement !== el) el[el.type === "checkbox" ? "checked" : "value"] = v; };
  if (L.kind === "text") {
    set("text-input", L.text); set("font", L.font); set("size", Math.min(400, L.size)); set("fill", L.fill);
    set("stroke", L.stroke); set("stroke-w", Math.round(L.strokeW * 100)); set("align", L.align); set("caps", L.caps);
  }
  if (L.kind === "image") { set("opacity", Math.round(L.opacity * 100)); $("uncut").disabled = !L.clips.length && !L.holes.length; }
  if (L.kind === "ink") set("ink-color", L.color);
  if (L.kind === "patch") set("patch-color", L.color);
  set("lock", !!L.locked);
  const i = doc.layers.indexOf(L), last = doc.layers.length - 1;
  $("to-back").disabled = $("down").disabled = i === 0;
  $("to-front").disabled = $("up").disabled = i === last;
}

/** Throw away changes since the last history entry (a cancelled drag). */
function revert() {
  clearTimeout(nudgeTimer); nudgeTimer = 0;
  penLayer = null;
  doc = structuredClone(hist.stack[hist.at]);
  if (sel && !byId(sel)) sel = null;
  render(); syncPanels();
}
function syncUndo() { $("undo").disabled = !hist.canUndo; $("redo").disabled = !hist.canRedo; }
function undoRedo(redo) {
  if (drag) return;
  flushNudge();
  penLayer = null;   // ids are reused after undo, so the pen must not trust an old id
  const d = redo ? hist.redo() : hist.undo();
  if (!d) return;
  doc = d; drag = null;
  if (sel && !byId(sel)) sel = null;
  syncUndo(); render(); syncPanels();
}

const HINTS = { select: "mm.hSelect", pen: "mm.hPen", cover: "mm.hCover", hole: "mm.hHole", cut: "mm.hCut" };
function setTool(name) {
  tool = name;
  if (name !== "pen") penLayer = null;
  for (const b of document.querySelectorAll("[data-tool]")) b.setAttribute("aria-pressed", b.dataset.tool === name);
  $("o-pen").hidden = name !== "pen";
  $("o-shape").hidden = name !== "hole" && name !== "cut";
  $("s-brush").hidden = name !== "hole";
  if (name === "cut" && opt.shape === "brush") setShape("ellipse");
  $("o-brush").hidden = !(name === "hole" && opt.shape === "brush");
  $("tool-hint").textContent = t(HINTS[name]);
  ov.dataset.tool = name;
  if (doc) drawOverlay();
}
function setShape(s) {
  opt.shape = s;
  for (const b of document.querySelectorAll("[data-shape]")) b.setAttribute("aria-pressed", b.dataset.shape === s);
  $("o-brush").hidden = !(tool === "hole" && s === "brush");
}

/** Change the selected layer. live: while a slider moves (no history entry yet). */
function edit(fn, live = false) {
  const L = selected();
  if (!L) return;
  fn(L);
  if (live) changed(); else commit();
}
function reorder(dir) {
  const i = doc.layers.findIndex((L) => L.id === sel);
  if (i < 0) return;
  doc.layers = M.moveLayer(doc.layers, i, dir);
  commit();
}
function duplicate() {
  const i = doc.layers.findIndex((L) => L.id === sel);
  if (i < 0) return;
  const id = nextId();
  doc.layers = M.duplicateLayer(doc.layers, i, id, 20 * unit());
  sel = id; commit();
}
function removeSelected() {
  if (!sel || !byId(sel)) return;
  doc.layers = doc.layers.filter((L) => L.id !== sel);
  sel = null; commit();
}
function setCaption(which, on) {
  const h = on ? M.captionHeight(doc.W) : 0;
  doc = which === "top" ? M.setCaptions(doc, h, doc.padBottom) : M.setCaptions(doc, doc.padTop, h);
  if (sel && !byId(sel)) sel = null;
  if (on) {
    const y = which === "top" ? h / 2 : doc.H - h / 2;
    hist.push(doc);   // the band and its text are two steps, so undo can take the text away first
    addText({ caption: which, y, w: doc.W * 0.94, h: h * 0.84, fill: "#000000", strokeW: 0, font: "gothic", size: Math.round(h * 0.5) });
  } else commit();
}

// ------------------------------------------------------------------ saving, copying, templates

function exportBlob() {
  render();
  return new Promise((res) => cv.toBlob(res, "image/png"));
}
async function save() {
  if (!doc) return;
  const blob = await exportBlob();
  if (!blob) { setStatus("mm.saveFail", null, true); return; }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: M.pngName(new Date()) }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  setStatus("mm.saved", { w: doc.W, h: doc.H });
  window.Site.toast(t("mm.toastSaved"));
}
async function copyImage() {
  if (!doc) return;
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no clipboard");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": exportBlob() })]);
    window.Site.toast(t("mm.toastCopied"));
  } catch { setStatus("mm.copyFail", null, true); }
}

const DB = "hp5000-meme", STORE = "templates";
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("no IndexedDB")); return; }
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      } catch (err) { db.close(); reject(err); }
    };
  });
}
let thumbs = [];
async function listTemplates() {
  let all = [];
  try { all = (await idb("readonly", (s) => s.getAll())) || []; }
  catch { $("tpl-empty").textContent = t("mm.tplUnavailable"); return; }
  for (const u of thumbs) URL.revokeObjectURL(u);
  thumbs = [];
  all.sort((a, b) => b.added - a.added);
  $("tpl-empty").hidden = all.length > 0;
  $("tpl-empty").textContent = t("mm.tplEmpty");
  $("tpl-grid").replaceChildren(...all.map((rec, i) => {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.type = "button"; open.className = "tpl-open"; open.setAttribute("aria-label", t("mm.tplOpen", { n: i + 1 }));
    const img = document.createElement("img");
    const url = URL.createObjectURL(rec.blob); thumbs.push(url);
    img.src = url; img.alt = ""; img.width = rec.w; img.height = rec.h;
    open.append(img);
    open.addEventListener("click", () => openBase(rec.blob));
    const del = document.createElement("button");
    del.type = "button"; del.className = "tpl-del"; del.textContent = "×";
    del.setAttribute("aria-label", t("mm.tplDelete", { n: i + 1 })); del.title = t("mm.tplDelete", { n: i + 1 });
    del.addEventListener("click", async () => {
      try { await idb("readwrite", (s) => s.delete(rec.id)); } catch { setStatus("mm.tplFail", null, true); listTemplates(); return; }
      listTemplates();
      setStatus("mm.tplDeleted");
    });
    li.append(open, del);
    return li;
  }));
}
async function saveTemplate() {
  if (!doc) return;
  const full = document.createElement("canvas"); full.width = doc.W; full.height = doc.H;
  drawDoc(full.getContext("2d"), doc, (L) => L.kind !== "text");
  const [w, h] = M.fitSize(doc.W, doc.H, M.MAX_PHOTO);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(full, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  try {
    if (!blob) throw new Error("no blob");
    const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
    await idb("readwrite", (s) => s.put({ id, blob, w, h, added: Date.now() }));
    await listTemplates();
    window.Site.toast(t("mm.toastTpl"));
  } catch { setStatus("mm.tplFail", null, true); }
}

// ------------------------------------------------------------------ wiring

function pickFile(input, fn) {
  input.addEventListener("change", async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await fn(f); });
}
function wire() {
  const drop = $("drop");
  const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  const imageOf = (list) => [...(list || [])].find((f) => f.type.startsWith("image/")) || (list && list[0]);
  pickFile($("file"), openBase);
  pickFile($("photo-file"), addPhoto);
  pickFile($("ink-file"), openInk);
  pickFile($("below-file"), addBelow);
  $("browse").addEventListener("click", () => $("file").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, () => drop.classList.add("over"));
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  // Dropped on the start card: a new background. Anywhere else while editing: a photo on top.
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const f = imageOf(e.dataTransfer.files);
    if (!doc || e.target.closest("#start")) openBase(f); else addPhoto(f);
  });
  window.addEventListener("paste", async (e) => {
    const cd = e.clipboardData;
    const f = [...(cd?.files ?? [])].find((x) => x.type.startsWith("image/"))
      || [...(cd?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (!f) return;
    e.preventDefault();
    if (!doc) { openBase(f); return; }
    const c = await readPicture(f, M.MAX_BASE, M.MAX_AREA);
    if (!c) return;
    const small = document.createElement("canvas");
    [small.width, small.height] = M.fitSize(c.width, c.height, M.MAX_PHOTO);
    small.getContext("2d").drawImage(c, 0, 0, small.width, small.height);
    addPhotoCanvas(small);
    setStatus("mm.photoAdded");
    window.Site.toast(t("mm.toastPasted"), { label: t("mm.useAsBase"), run: () => openBaseCanvas(c) });
  });
  $("blank").addEventListener("click", openBlank);

  for (const b of document.querySelectorAll("[data-tool]")) b.addEventListener("click", () => setTool(b.dataset.tool));
  for (const b of document.querySelectorAll("[data-shape]")) b.addEventListener("click", () => setShape(b.dataset.shape));
  $("pen-color").addEventListener("input", (e) => { opt.penColor = e.target.value; penLayer = null; });
  $("pen-size").addEventListener("input", (e) => { opt.penSize = +e.target.value; drawOverlay(); });
  $("brush-size").addEventListener("input", (e) => { opt.brush = +e.target.value; });
  $("feather").addEventListener("input", (e) => { opt.feather = +e.target.value; });
  $("add-text").addEventListener("click", () => doc && addText());
  $("add-photo").addEventListener("click", () => $("photo-file").click());
  $("add-ink").addEventListener("click", () => $("ink-file").click());
  $("add-below").addEventListener("click", () => $("below-file").click());

  ov.addEventListener("pointerdown", onDown);
  ov.addEventListener("pointermove", onMove);
  ov.addEventListener("pointerup", onUp);
  ov.addEventListener("pointercancel", onUp);
  ov.addEventListener("pointerleave", () => { hover = null; if (!drag) drawOverlay(); });
  ov.addEventListener("dblclick", () => { const L = selected(); if (L && L.kind === "text") { $("text-input").focus(); $("text-input").select(); } });
  new ResizeObserver(sizeOverlay).observe($("stage"));

  // Side panel.
  $("cap-top").addEventListener("change", (e) => setCaption("top", e.target.checked));
  $("cap-bottom").addEventListener("change", (e) => setCaption("bottom", e.target.checked));
  $("bg").addEventListener("input", (e) => { doc.bg = e.target.value; changed(); });
  $("bg").addEventListener("change", commit);
  $("text-input").addEventListener("input", (e) => edit((L) => { L.text = e.target.value; }, true));
  $("text-input").addEventListener("change", commit);
  const field = (id, fn) => {
    $(id).addEventListener("input", (e) => edit((L) => fn(L, e.target), true));
    $(id).addEventListener("change", (e) => edit((L) => fn(L, e.target)));
  };
  field("font", (L, el) => { L.font = el.value; });
  field("size", (L, el) => { L.size = +el.value; });
  field("fill", (L, el) => { L.fill = el.value; });
  field("stroke", (L, el) => { L.stroke = el.value; });
  field("stroke-w", (L, el) => { L.strokeW = +el.value / 100; });
  field("align", (L, el) => { L.align = el.value; });
  field("caps", (L, el) => { L.caps = el.checked; });
  field("opacity", (L, el) => { L.opacity = +el.value / 100; });
  field("ink-color", (L, el) => { L.color = el.value; });
  field("patch-color", (L, el) => { L.color = el.value; });
  field("lock", (L, el) => { L.locked = el.checked; });
  $("flip").addEventListener("click", () => edit((L) => { L.flip = !L.flip; }));
  $("uncut").addEventListener("click", () => {
    const L = selected(); if (!L || L.kind !== "image") return;
    const a = assets.get(L.src), i = doc.layers.indexOf(L);
    doc.layers[i] = M.cropTo({ ...L, clips: [], holes: [] }, { x: 0, y: 0, w: a.width, h: a.height });
    commit();
  });
  $("patch-auto").addEventListener("click", () => edit((L) => { L.color = sampleAround({ x: L.x - L.w / 2, y: L.y - L.h / 2, w: L.w, h: L.h }, L.id); }));
  $("to-back").addEventListener("click", () => reorder("bottom"));
  $("down").addEventListener("click", () => reorder("down"));
  $("up").addEventListener("click", () => reorder("up"));
  $("to-front").addEventListener("click", () => reorder("top"));
  $("dup").addEventListener("click", duplicate);
  $("del").addEventListener("click", removeSelected);
  $("layers").addEventListener("click", (e) => {
    const pick = e.target.closest("[data-id]"), eye = e.target.closest("[data-eye]");
    if (eye) { const L = byId(eye.dataset.eye); L.hidden = !L.hidden; commit(); return; }
    if (pick) { sel = pick.dataset.id; setTool("select"); changed(); }
  });

  $("undo").addEventListener("click", () => undoRedo(false));
  $("redo").addEventListener("click", () => undoRedo(true));
  $("save").addEventListener("click", save);
  $("copy").addEventListener("click", copyImage);
  $("save-tpl").addEventListener("click", saveTemplate);

  $("ink-t").addEventListener("input", previewInk);
  $("ink-c").addEventListener("input", previewInk);
  $("ink-ok").addEventListener("click", addInk);
  $("ink-cancel").addEventListener("click", () => { $("ink-dlg").close(); ink = null; });

  window.addEventListener("keydown", (e) => {
    const typing = editing(e.target);
    if (e.altKey || (e.getModifierState && e.getModifierState("AltGraph"))) return;   // AltGr types letters (ó, ś) on some keyboards
    if (drag && e.key !== "Escape") return;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "o") { e.preventDefault(); $("file").click(); }
      else if (k === "s") { e.preventDefault(); save(); }
      else if (!typing && doc && k === "z") { e.preventDefault(); undoRedo(e.shiftKey); }
      else if (!typing && doc && k === "y") { e.preventDefault(); undoRedo(true); }
      else if (!typing && doc && k === "d") { e.preventDefault(); duplicate(); }
      return;
    }
    if (typing || !doc || $("ink-dlg").open) return;
    if (e.key === "Escape") { if (drag) revertDrag(); else if (tool !== "select") setTool("select"); else { sel = null; changed(); } return; }
    const L = selected();
    if (!L || L.locked) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
    const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      L.x += mv[0]; L.y += mv[1]; changed();
      clearTimeout(nudgeTimer); nudgeTimer = setTimeout(commit, 400);
    }
  });
}

function applyLang() {
  if (status) setStatus(status.key, status.vars, status.error);
  $("tool-hint").textContent = t(HINTS[tool]);
  syncPanels();
  listTemplates();
}

wire();
setTool("select");
window.Site.onChange(applyLang);
listTemplates();
// Test hook, only with #selftest.
if (location.hash === "#selftest") {
  window.memeMaker = {
    get doc() { return doc; }, get sel() { return sel; }, set sel(v) { sel = v; changed(); },
    openBase, openBlank, addPhoto, addBelow, addText, openInk, addInk, setTool, setShape, setCaption, render, commit,
    undo: () => undoRedo(false), redo: () => undoRedo(true), exportBlob, saveTemplate, listTemplates, opt, assets,
    onDown, onMove, onUp, canvasPoint, sampleAround, scale: () => scale,
  };
}

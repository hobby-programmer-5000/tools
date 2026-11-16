// Meme Maker logic: text fitting, layer geometry, layer order, canvas layout, pixel helpers and history.
// No DOM here, so all of it runs and is tested in Node (test/meme.test.mjs).

export const MAX_BASE = 4096;    // long side of a background image; bigger ones are scaled down
export const MAX_AREA = 12e6;     // pixels of a background: iPhone Safari refuses canvases over about 16.7 M px,
                                 // and caption bands and pictures below are added on top of this
export const MAX_PHOTO = 2048;   // long side of an added photo, a handwriting photo or a saved template
export const HISTORY_LIMIT = 100;
export const LINE_HEIGHT = 1.15;
export const MIN_SIZE = 6;
export const MIN_BOX = 12;       // smallest layer side in canvas pixels

// Only fonts the system already has. A web font split by Unicode range would fetch a new file for new
// characters, and the request would hint at what someone typed (see the site's CLAUDE.md).
export const FONTS = {
  gothic: { weight: 700, stack: '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", system-ui, sans-serif' },
  impact: { weight: 400, stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif' },
  serif: { weight: 700, stack: 'Batang, "Nanum Myeongjo", AppleMyungjo, "Noto Serif KR", "Noto Serif CJK KR", Georgia, serif' },
  comic: { weight: 700, stack: '"Comic Sans MS", "Chalkboard SE", "Malgun Gothic", "Apple SD Gothic Neo", cursive' },
};
export const fontCss = (font, size) => `${(FONTS[font] || FONTS.gothic).weight} ${size}px ${(FONTS[font] || FONTS.gothic).stack}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Scale (w, h) down so the long side is at most max and the area at most maxArea. Never scales up.
 *  Integers, at least 1. */
export function fitSize(w, h, max, maxArea = Infinity) {
  const k = Math.min(1, max / Math.max(w, h), Math.sqrt(maxArea / (w * h)));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

// ------------------------------------------------------------------ text

function graphemes(s) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment);
  return Array.from(s);
}

/**
 * Break text into lines no wider than maxW. Words wrap at spaces; a word wider than a line (a long Korean
 * phrase with no spaces, a URL) breaks between characters. measure(str) gives a width at the current size.
 */
export function wrapLines(text, maxW, measure) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const tok of para.match(/\S+|\s+/g) || []) {
      if (/^\s/.test(tok)) { if (line) line += tok; continue; }
      if (measure(line + tok) <= maxW) { line += tok; continue; }
      if (line.trim()) { out.push(line.trimEnd()); line = ""; }
      if (measure(tok) <= maxW) { line = tok; continue; }
      for (const ch of graphemes(tok)) {
        if (line && measure(line + ch) > maxW) { out.push(line); line = ""; }
        line += ch;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/**
 * The largest whole font size at which the text fits the box, no bigger than maxSize.
 * measureAt(size) returns a measure(str) function for that size. stroke is the outline width per side as a
 * share of the font size; the outline needs room too. Returns { size, lines, fits }.
 */
export function fitText(text, boxW, boxH, maxSize, measureAt, stroke = 0) {
  const tryAt = (size) => {
    const measure = measureAt(size), pad = 2 * stroke * size, maxW = Math.max(1, boxW - pad);
    const lines = wrapLines(text, maxW, measure);
    const fits = lines.length * size * LINE_HEIGHT + pad <= boxH && lines.every((l) => measure(l) <= maxW);
    return { size, lines, fits };
  };
  let lo = MIN_SIZE, hi = Math.max(MIN_SIZE, Math.floor(maxSize));
  if (!tryAt(lo).fits) return tryAt(lo);
  while (lo < hi) {                                   // largest size that fits
    const mid = Math.ceil((lo + hi) / 2);
    if (tryAt(mid).fits) lo = mid; else hi = mid - 1;
  }
  return tryAt(lo);
}

// ------------------------------------------------------------------ geometry
// Every layer has a center (x, y), a size (w, h), a rotation rot in radians and flip (mirrored left-right).
// Image and ink layers also have crop, the part of their source shown, in source pixels.

/** Canvas point to layer space: origin at the layer center, axes along the layer, before flipping. */
export function toLocal(L, px, py) {
  const dx = px - L.x, dy = py - L.y, c = Math.cos(L.rot || 0), s = Math.sin(L.rot || 0);
  return [dx * c + dy * s, -dx * s + dy * c];
}
/** Layer space to canvas point. */
export function toCanvas(L, u, v) {
  const c = Math.cos(L.rot || 0), s = Math.sin(L.rot || 0);
  return [L.x + u * c - v * s, L.y + u * s + v * c];
}
export function contains(L, px, py, margin = 0) {
  const [u, v] = toLocal(L, px, py);
  return Math.abs(u) <= L.w / 2 + margin && Math.abs(v) <= L.h / 2 + margin;
}
/** Canvas point to the layer's source pixels (crop space), taking flip into account. */
export function toSource(L, px, py) {
  let [u, v] = toLocal(L, px, py);
  if (L.flip) u = -u;
  return [L.crop.x + (u / L.w + 0.5) * L.crop.w, L.crop.y + (v / L.h + 0.5) * L.crop.h];
}
export function sourceToCanvas(L, sx, sy) {
  let u = ((sx - L.crop.x) / L.crop.w - 0.5) * L.w;
  const v = ((sy - L.crop.y) / L.crop.h - 0.5) * L.h;
  if (L.flip) u = -u;
  return toCanvas(L, u, v);
}
export function corners(L) {
  const w = L.w / 2, h = L.h / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([u, v]) => toCanvas(L, u, v));
}
const HANDLES = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };

/** Which handle is at (px, py): a corner, "rot" or null. r is the grab radius. The rotate handle is rotGap above
 *  the top edge, or below the bottom edge when `below` (used when above would be off the canvas). */
export function handleAt(L, px, py, r, rotGap, below = false) {
  const [u, v] = toLocal(L, px, py);
  if (Math.hypot(u, v - (below ? L.h / 2 + rotGap : -L.h / 2 - rotGap)) <= r) return "rot";
  for (const [k, [sx, sy]] of Object.entries(HANDLES)) if (Math.hypot(u - sx * L.w / 2, v - sy * L.h / 2) <= r) return k;
  return null;
}

/** Resize by dragging a corner: the opposite corner stays where it is. Returns the new { x, y, w, h }. */
export function resizeFrom(L, handle, px, py, keepRatio) {
  const [sx, sy] = HANDLES[handle];
  const ax = -sx * L.w / 2, ay = -sy * L.h / 2;          // the fixed corner, in layer space
  const [u, v] = toLocal(L, px, py);
  let w = Math.max(MIN_BOX, (u - ax) * sx), h = Math.max(MIN_BOX, (v - ay) * sy);
  if (keepRatio) {
    const k = Math.max(w / L.w, h / L.h, MIN_BOX / Math.min(L.w, L.h));
    w = L.w * k; h = L.h * k;
  }
  const [x, y] = toCanvas(L, ax + sx * w / 2, ay + sy * h / 2);
  return { x, y, w, h };
}

/** Rotation that points the rotate handle at (px, py). With snap, rounds to 15 degrees. below: the handle
 *  sits under the box, so it points the other way. */
export function rotationTo(L, px, py, snap, below = false) {
  let a = Math.atan2(py - L.y, px - L.x) + (below ? -Math.PI / 2 : Math.PI / 2);
  if (snap) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
  a = Math.atan2(Math.sin(a), Math.cos(a));               // keep it in (-PI, PI]
  return Math.abs(a) < 1e-9 ? 0 : a;
}

/** Even-odd rule: works for concave and self-crossing lassos. */
export function pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Bounding box of a shape in source pixels, grown by its feather. Shapes: ellipse, poly, stroke. */
export function shapeBounds(sh) {
  let x0, y0, x1, y1;
  if (sh.type === "ellipse") { x0 = sh.cx - sh.rx; x1 = sh.cx + sh.rx; y0 = sh.cy - sh.ry; y1 = sh.cy + sh.ry; }
  else {
    const xs = sh.pts.map((p) => p[0]), ys = sh.pts.map((p) => p[1]), r = sh.type === "stroke" ? sh.r : 0;
    x0 = Math.min(...xs) - r; x1 = Math.max(...xs) + r; y0 = Math.min(...ys) - r; y1 = Math.max(...ys) + r;
  }
  const f = sh.feather || 0;
  return { x: x0 - f, y: y0 - f, w: x1 - x0 + 2 * f, h: y1 - y0 + 2 * f };
}
export function intersect(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Show only `box` (source pixels) of an image or ink layer, without moving anything on the canvas:
 * every source pixel inside the box lands where it was before.
 */
export function cropTo(L, box) {
  const kx = L.w / L.crop.w, ky = L.h / L.crop.h;
  const [x, y] = sourceToCanvas(L, box.x + box.w / 2, box.y + box.h / 2);
  return { ...L, x, y, w: box.w * kx, h: box.h * ky, crop: { ...box } };
}

// ------------------------------------------------------------------ layers

/** Move layer i: "up", "down" (one step), "top", "bottom". Index 0 is drawn first (at the back). */
export function moveLayer(layers, i, dir) {
  const out = layers.slice();
  const [L] = out.splice(i, 1);
  const to = { up: i + 1, down: i - 1, top: out.length, bottom: 0 }[dir];
  out.splice(clamp(to, 0, out.length), 0, L);
  return out;
}
export function duplicateLayer(layers, i, id, offset) {
  const out = layers.slice();
  const copy = structuredClone(layers[i]);
  Object.assign(copy, { id, x: copy.x + offset, y: copy.y + offset, locked: false, base: false, panel: false, caption: undefined });
  out.splice(i + 1, 0, copy);
  return out;
}

// ------------------------------------------------------------------ canvas layout
// doc: { W, H, padTop, padBottom, bg, layers, seq }. Caption bands are empty space at the top and bottom
// of the canvas, filled with doc.bg. Layer positions are canvas positions.

/** Turn the caption bands on or off. Everything below the top band moves with it; caption text of a band
 *  that is turned off is removed with the band. */
export function setCaptions(doc, top, bottom) {
  const dy = top - doc.padTop;
  const layers = doc.layers
    .filter((L) => !(L.caption === "top" && top === 0) && !(L.caption === "bottom" && bottom === 0))
    .map((L) => (L.caption === "top" ? L : { ...L, y: L.y + dy }));
  const body = doc.H - doc.padTop - doc.padBottom;
  return { ...doc, padTop: top, padBottom: bottom, H: top + body + bottom, layers };
}

/** Make room for an image of iw x ih below the current picture (above the bottom band), scaled to the
 *  canvas width. Returns the new doc and the box the image should fill. */
export function attachBelow(doc, iw, ih) {
  const h = Math.max(1, Math.round(ih * doc.W / iw));
  const y0 = doc.H - doc.padBottom;
  const layers = doc.layers.map((L) => (L.caption === "bottom" ? { ...L, y: L.y + h } : L));
  return { doc: { ...doc, H: doc.H + h, layers }, box: { x: doc.W / 2, y: y0 + h / 2, w: doc.W, h } };
}

/** Default caption band height for a canvas width. */
export const captionHeight = (W) => Math.max(40, Math.round(W * 0.18));

// ------------------------------------------------------------------ pixels

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Otsu's threshold on luminance: splits a handwriting photo into ink and paper. */
export function otsu(rgba) {
  const hist = new Float64Array(256);
  let n = 0;
  for (let q = 0; q < rgba.length; q += 4) { if (rgba[q + 3] < 8) continue; hist[Math.round(lum(rgba[q], rgba[q + 1], rgba[q + 2]))]++; n++; }
  if (!n) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, at = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; at = t; }
  }
  return at;
}

/**
 * Keep the ink of a handwriting photo and drop the paper. Pixels at or above `threshold` luminance become
 * transparent, pixels at or below threshold - soft keep full opacity, and the ones between fade, so stroke
 * edges stay smooth. All kept pixels take the color rgb.
 */
export function extractInk(rgba, threshold, soft, rgb) {
  const out = new Uint8ClampedArray(rgba.length), s = Math.max(1, soft);
  for (let q = 0; q < rgba.length; q += 4) {
    const a = clamp((threshold - lum(rgba[q], rgba[q + 1], rgba[q + 2])) / s, 0, 1) * rgba[q + 3];
    out[q] = rgb[0]; out[q + 1] = rgb[1]; out[q + 2] = rgb[2]; out[q + 3] = Math.round(a);
  }
  return out;
}

/** Smallest box holding every pixel with alpha >= min, or null if there is none. */
export function alphaBounds(rgba, w, h, min = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] < min) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Average color of the ring of pixels just outside rect (ring pixels wide), for covering old text with the
 * color around it. Transparent pixels are skipped. Falls back to the inside of rect, then to null.
 */
export function borderAverage(rgba, w, h, rect, ring = 3) {
  const x0 = Math.round(rect.x), y0 = Math.round(rect.y), x1 = Math.round(rect.x + rect.w), y1 = Math.round(rect.y + rect.h);
  const avg = (keep) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.max(0, y0 - ring); y < Math.min(h, y1 + ring); y++) for (let x = Math.max(0, x0 - ring); x < Math.min(w, x1 + ring); x++) {
      if (!keep(x, y)) continue;
      const q = (y * w + x) * 4;
      if (rgba[q + 3] < 8) continue;
      r += rgba[q]; g += rgba[q + 1]; b += rgba[q + 2]; n++;
    }
    return n ? [r / n, g / n, b / n].map(Math.round) : null;
  };
  const inRect = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
  return avg((x, y) => !inRect(x, y)) || avg(inRect);
}
export const toHex = (rgb) => "#" + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
export function fromHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** File name for a saved meme, from the time only (never from what was typed or opened). */
export function pngName(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `meme-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

// ------------------------------------------------------------------ history

/** Undo and redo over whole-document snapshots. Images are kept outside the document, by id. */
export class History {
  constructor(limit = HISTORY_LIMIT) { this.limit = limit; this.stack = []; this.at = -1; }
  reset(state) { this.stack = [structuredClone(state)]; this.at = 0; }
  push(state) {
    this.stack = this.stack.slice(0, this.at + 1);
    this.stack.push(structuredClone(state));
    if (this.stack.length > this.limit) this.stack.shift();
    this.at = this.stack.length - 1;
  }
  get canUndo() { return this.at > 0; }
  get canRedo() { return this.at < this.stack.length - 1; }
  undo() { return this.canUndo ? structuredClone(this.stack[--this.at]) : null; }
  redo() { return this.canRedo ? structuredClone(this.stack[++this.at]) : null; }
}

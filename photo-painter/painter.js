// Photo Painter logic: decides which strokes to lay for one brush size. No DOM, so Node can test it.
// Painterly rendering after Hertzmann (SIGGRAPH 98): layers of opaque strokes, large brush to small,
// each layer correcting where the painting differs most from a blurred photo, strokes following
// the normals of the luminance gradient. Sources are in REFERENCES.md.

export const SIZES  = [126, 69, 38, 21, 12, 7, 4, 3];                    // brush widths in px, two per pass
export const DUR    = [5.5, 5.5, 5, 5, 5, 5, 4.5, 4.5];                  // seconds at 1x, 40 in all
export const STEPS  = [2, 3, 4, 5, 6, 7, 8, 8];                          // most steps in one stroke
export const GRID   = [0.75, 0.75, 0.75, 0.75, 0.75, 0.72, 0.75, 0.67];  // patch side = GRID * brush
export const BUDGET = [1e9, 1e9, 1e9, 2600, 6200, 10500, 15000, 16500];  // most strokes per size
export const TMIN   = [3, 4, 4, 4, 4, 4, 4, 3.5];                        // least mean error worth painting
export const WANDER = 3;         // sizes 0..2 wander one step in flat areas, the rest leave a dab
export const LONG   = 840;       // the painting's long side in px
export const PAPER  = "#f4f1ec";
export const SEED   = 20261115;
export const TOTAL  = DUR.reduce((a, b) => a + b, 0);

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Painting size for a photo: the long side becomes `long` px, the shape is kept.
// The short side never goes under MIN_SIDE px: planLayer reads a neighbour on each side of a pixel.
export const MIN_SIDE = 3;
export function fitSize(w, h, long = LONG) {
  const k = long / Math.max(w, h);
  return [Math.max(MIN_SIDE, Math.round(w * k)), Math.max(MIN_SIDE, Math.round(h * k))];
}

// RGBA bytes -> three float channels.
export function channels(rgba, n) {
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let p = 0, q = 0; p < n; p++, q += 4) { r[p] = rgba[q]; g[p] = rgba[q + 1]; b[p] = rgba[q + 2]; }
  return { r, g, b };
}

// File name for the saved painting. The photo's name is kept, minus characters Windows rejects.
export function pngName(photoName) {
  const base = String(photoName || "").replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80);
  return (base ? base + "-" : "") + "painting.png";
}

function blurH(s, d, w, h, r) {
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let k = -r; k <= r; k++) acc += s[o + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      d[o + x] = acc / n;
      const a = x - r, b = x + r + 1;
      acc += s[o + (b < w ? b : w - 1)] - s[o + (a > 0 ? a : 0)];
    }
  }
}
function blurV(s, d, w, h, r) {
  const n = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += s[x + w * Math.min(h - 1, Math.max(0, k))];
    for (let y = 0; y < h; y++) {
      d[x + y * w] = acc / n;
      const a = y - r, b = y + r + 1;
      acc += s[x + w * (b < h ? b : h - 1)] - s[x + w * (a > 0 ? a : 0)];
    }
  }
}
export function blur(src, w, h, r) {               // three box passes, close to a Gaussian
  if (r < 1) return src;
  const a = new Float32Array(src.length), b = new Float32Array(src.length);
  blurH(src, a, w, h, r); blurV(a, b, w, h, r);
  blurH(b, a, w, h, r);   blurV(a, b, w, h, r);
  blurH(b, a, w, h, r);   blurV(a, b, w, h, r);
  return b;
}
const hex2 = v => (v < 16 ? "0" : "") + v.toString(16);

// Strokes for brush size i. `ref` is the photo ({r, g, b} floats, W*H each), `snap` the painting so far
// (RGBA bytes), `rng` a seeded generator. Returns [{pts: [x0, y0, x1, y1, ...], len, hex}] in painting order.
export function planLayer(i, W, H, ref, snap, rng) {
  const b = SIZES[i], r = Math.round(b * 0.25);
  const R = blur(ref.r, W, H, r), G = blur(ref.g, W, H, r), B = blur(ref.b, W, H, r);
  const L = new Float32Array(W * H);
  for (let p = 0; p < L.length; p++) L[p] = 0.299 * R[p] + 0.587 * G[p] + 0.114 * B[p];
  const D = new Float32Array(W * H);
  for (let p = 0, q = 0; p < D.length; p++, q += 4) {
    const dr = R[p] - snap[q], dg = G[p] - snap[q + 1], db = B[p] - snap[q + 2];
    D[p] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
  // patches: mean error and worst pixel
  const gs = Math.max(2, Math.round(b * GRID[i]));
  let cells = [];
  for (let y0 = 0; y0 < H; y0 += gs) for (let x0 = 0; x0 < W; x0 += gs) {
    const x1 = Math.min(W, x0 + gs), y1 = Math.min(H, y0 + gs);
    let sum = 0, worst = -1, wp = 0;
    for (let y = y0; y < y1; y++) for (let x = x0, p = y * W + x0; x < x1; x++, p++) {
      const d = D[p]; sum += d; if (d > worst) { worst = d; wp = p; }
    }
    const mean = sum / ((x1 - x0) * (y1 - y0));
    if (mean > TMIN[i]) cells.push({ mean, wp, k: cells.length });
  }
  if (cells.length > BUDGET[i]) {
    cells.sort((a, c) => c.mean - a.mean || a.k - c.k);
    cells.length = BUDGET[i];
    cells.sort((a, c) => a.k - c.k);
  }
  const dist = (p, cr, cg, cb) => { const dr = R[p] - cr, dg = G[p] - cg, db = B[p] - cb; return Math.sqrt(dr * dr + dg * dg + db * db); };
  const step = Math.max(3, b), flat = Math.max(0.35, 4 / b);
  const strokes = [];
  for (const c of cells) {
    let x = c.wp % W, y = (c.wp - x) / W;
    const cr = Math.round(R[c.wp]), cg = Math.round(G[c.wp]), cb = Math.round(B[c.wp]);
    const pts = [x, y]; let ldx = 0, ldy = 0;
    for (let s = 1; s <= STEPS[i]; s++) {
      const xi = Math.min(W - 2, Math.max(1, Math.round(x))), yi = Math.min(H - 2, Math.max(1, Math.round(y))), p = yi * W + xi;
      const gx = (L[p + 1] - L[p - 1]) / 2, gy = (L[p + W] - L[p - W]) / 2, mag = Math.hypot(gx, gy);
      let dx, dy, last = false;
      if (mag < flat) {                             // flat area
        if (s > 1 || i >= WANDER) break;
        const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); last = true;
      } else {
        dx = -gy / mag; dy = gx / mag;              // along the edge
        if (s === 1) { if (rng() < 0.5) { dx = -dx; dy = -dy; } }
        else {
          if (dx * ldx + dy * ldy < 0) { dx = -dx; dy = -dy; }
          dx = 0.7 * dx + 0.3 * ldx; dy = 0.7 * dy + 0.3 * ldy;
          const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        }
      }
      const nx = x + dx * step, ny = y + dy * step;
      if (nx < 0 || ny < 0 || nx > W - 1 || ny > H - 1) break;
      const q = Math.round(ny) * W + Math.round(nx), q4 = q * 4;
      // stop where the painting is already closer to the photo than this colour would be
      const dPaint = Math.sqrt((R[q] - snap[q4]) ** 2 + (G[q] - snap[q4 + 1]) ** 2 + (B[q] - snap[q4 + 2]) ** 2);
      if (dPaint < dist(q, cr, cg, cb)) break;
      pts.push(nx, ny); x = nx; y = ny; ldx = dx; ldy = dy;
      if (last) break;
    }
    let len = 0; for (let k = 2; k < pts.length; k += 2) len += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
    strokes.push({ pts, len, hex: hex2(cr) + hex2(cg) + hex2(cb), key: pts[1] / H + (rng() - 0.5) * 0.3 });
  }
  strokes.sort((a, c) => a.key - c.key);            // roughly top to bottom, like a hand working down
  for (const s of strokes) delete s.key;
  return strokes;
}

// Scrollfold geometry and zip helpers. No DOM access, so Node can test this file.
// Mirrors core.py; tests in web/split.test.mjs check the same cases as test_core.py.

export const DEFAULT_STRIPS = 20;
export const MIN_STRIPS = 1;
export const MAX_STRIPS = 20;
export const X_MAX_SIDE = 4096;
export const X_MAX_BYTES = 5 * 1024 * 1024;
export const JPEG_QUALITIES = [0.92, 0.88, 0.84, 0.8, 0.75, 0.7, 0.65, 0.6, 0.5, 0.4];

// Same list as core.RATIOS (measured from X posts, see reference.md).
export const RATIOS = { "1:2": [1, 2], "9:16": [9, 16], "3:4": [3, 4], "1:1": [1, 1], "1:12": [1, 12], original: null };
export const DEFAULT_RATIO = "1:2";
export const LARGE_WARN_PIXELS = 100_000_000;
export const MAX_PIXELS = 400_000_000;
export const FIT_MODES = ["crop", "blur", "black", "white"];
export const DEFAULT_FIT = "crop";

export class SplitError extends Error {
  constructor(message, kind = "other", info = {}) { super(message); this.kind = kind; this.info = info; }
}

// Python-style round (half to even) so results match core.py exactly.
export function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export function stripBoxes(width, height, count) {
  if (!(count >= MIN_STRIPS && count <= MAX_STRIPS)) throw new SplitError(`count must be ${MIN_STRIPS}-${MAX_STRIPS}`, "bad_count", { min: MIN_STRIPS, max: MAX_STRIPS });
  const sw = Math.floor(width / count);
  if (sw < 1) throw new SplitError(`image is ${width}px wide, too narrow for ${count} strips`, "too_narrow", { width, count, max: Math.min(MAX_STRIPS, width) });
  const left0 = Math.floor((width - sw * count) / 2);
  return Array.from({ length: count }, (_, i) => [left0 + i * sw, 0, left0 + (i + 1) * sw, height]);
}

export const targetAspect = (count, ratio) => (count * ratio[0]) / ratio[1];

export function suggestCount(width, height, ratio) {
  if (!ratio) return DEFAULT_STRIPS;
  const n = pyRound(width / height / (ratio[0] / ratio[1]));
  return Math.min(MAX_STRIPS, Math.max(MIN_STRIPS, n));
}

export function cropBox(width, height, aspect) {
  if (width / height > aspect) {
    const w = Math.max(1, pyRound(height * aspect));
    const x = Math.floor((width - w) / 2);
    return [x, 0, x + w, height];
  }
  const h = Math.max(1, pyRound(width / aspect));
  const y = Math.floor((height - h) / 2);
  return [0, y, width, y + h];
}

export function padSize(width, height, aspect) {
  if (width / height > aspect) return [width, Math.max(height, pyRound(width / aspect))];
  return [Math.max(width, pyRound(height * aspect)), height];
}

/** Size of the image that gets split, plus where the source sits in it. */
export function plan(width, height, count, ratio, mode) {
  if (!ratio) return { w: width, h: height, crop: [0, 0, width, height], offset: [0, 0] };
  const aspect = targetAspect(count, ratio);
  if (mode === "crop") {
    const c = cropBox(width, height, aspect);
    return { w: c[2] - c[0], h: c[3] - c[1], crop: c, offset: [0, 0] };
  }
  if (!FIT_MODES.includes(mode)) throw new SplitError(`unknown fit mode: ${mode}`);
  const [w, h] = padSize(width, height, aspect);
  return { w, h, crop: [0, 0, width, height], offset: [Math.floor((w - width) / 2), Math.floor((h - height) / 2)] };
}

export function fitWithin(w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return [Math.max(1, pyRound(w * s)), Math.max(1, pyRound(h * s))];
}

/** Folder/file name that is valid on Windows, macOS and Linux. */
export function safeName(stem) {
  let name = stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^[ .]+|[ .]+$/g, "");
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(name)) name = "_" + name;
  return name.slice(0, 100) || "image";
}

export const stripName = (i, total, ext) => `${String(i).padStart(Math.max(2, String(total).length), "0")}.${ext}`;

// ---------------------------------------------------------------- zip (store only)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build an uncompressed zip. files: [{name, data: Uint8Array}]. Returns Uint8Array. */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cenSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

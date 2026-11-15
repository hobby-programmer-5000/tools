// Photo Painter logic and page checks. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../photo-painter/painter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "photo-painter");

// A small test photo: left half red, right half blue, on a canvas of w x h.
function photo(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4, left = x < w / 2;
    rgba[q] = left ? 200 : 20; rgba[q + 1] = 30; rgba[q + 2] = left ? 20 : 200; rgba[q + 3] = 255;
  }
  return rgba;
}
function paper(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let q = 0; q < rgba.length; q += 4) { rgba[q] = 0xf4; rgba[q + 1] = 0xf1; rgba[q + 2] = 0xec; rgba[q + 3] = 255; }
  return rgba;
}
const W = 240, H = 160;
const ref = P.channels(photo(W, H), W * H);

test("pp1. the painting's long side is 840 px and the shape is kept", () => {
  assert.deepEqual(P.fitSize(600, 400), [840, 560]);
  assert.deepEqual(P.fitSize(300, 500), [504, 840]);
  assert.deepEqual(P.fitSize(4000, 4000), [840, 840]);
  assert.deepEqual(P.fitSize(10000, 1), [840, 3]);   // never thinner than 3 px
  assert.deepEqual(P.fitSize(1, 10000), [3, 840]);
});

test("pp2. eight brushes from 126 px down to 3 px, 40 seconds in all", () => {
  assert.deepEqual(P.SIZES, [126, 69, 38, 21, 12, 7, 4, 3]);
  for (const k of ["DUR", "STEPS", "GRID", "BUDGET", "TMIN"]) assert.equal(P[k].length, P.SIZES.length, k);
  assert.equal(P.TOTAL, 40);
});

test("pp3. the same photo and seed give the same strokes", () => {
  for (const i of [0, 3, 7]) {
    const a = P.planLayer(i, W, H, ref, paper(W, H), P.mulberry32(P.SEED));
    const b = P.planLayer(i, W, H, ref, paper(W, H), P.mulberry32(P.SEED));
    assert.ok(a.length > 0, `size ${i} planned no strokes`);
    assert.deepEqual(a, b);
  }
});

test("pp4. every stroke takes its colour from the blurred photo where it starts, and stays on the canvas", () => {
  const blurred = P.SIZES.map((size) => {
    const r = Math.round(size * 0.25);
    return { r: P.blur(ref.r, W, H, r), g: P.blur(ref.g, W, H, r), b: P.blur(ref.b, W, H, r) };
  });
  let checked = 0, colours = new Set();
  for (let i = 0; i < P.SIZES.length; i++) {
    const strokes = P.planLayer(i, W, H, ref, paper(W, H), P.mulberry32(P.SEED));
    assert.ok(strokes.length <= P.BUDGET[i]);
    for (const s of strokes) {
      assert.match(s.hex, /^[0-9a-f]{6}$/);
      // The colour is the photo's, blurred by a quarter of the brush width, at the stroke's first point.
      const at = s.pts[1] * W + s.pts[0];
      assert.equal(s.hex, [blurred[i].r[at], blurred[i].g[at], blurred[i].b[at]].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
        `size ${i}: colour ${s.hex} is not the blurred photo's colour at ${s.pts[0]},${s.pts[1]}`);
      assert.ok(s.pts.length >= 2 && s.pts.length % 2 === 0 && s.pts.length <= 2 * (P.STEPS[i] + 1));
      for (let k = 0; k < s.pts.length; k += 2) {
        assert.ok(s.pts[k] >= 0 && s.pts[k] <= W - 1 && s.pts[k + 1] >= 0 && s.pts[k + 1] <= H - 1);
      }
      checked++; colours.add(s.hex);
    }
  }
  assert.ok(checked > 100, `only ${checked} strokes checked`);
  assert.ok(colours.has("c81e14") && colours.has("141ec8"), "the photo's own red and blue were never used");
});

test("pp5. a painting that already matches the photo gets no more strokes", () => {
  const flat = new Uint8ClampedArray(W * H * 4);
  for (let q = 0; q < flat.length; q += 4) { flat[q] = 90; flat[q + 1] = 120; flat[q + 2] = 150; flat[q + 3] = 255; }
  const flatRef = P.channels(flat, W * H);
  for (let i = 0; i < P.SIZES.length; i++) {
    assert.equal(P.planLayer(i, W, H, flatRef, flat, P.mulberry32(P.SEED)).length, 0, `size ${i}`);
  }
});

test("pp5b. a very thin photo still gets real strokes (no NaN points)", () => {
  for (const [w, h] of [P.fitSize(20000, 40), P.fitSize(40, 20000), [840, 3], [3, 840]]) {
    const thin = P.channels(photo(w, h), w * h);
    let n = 0;
    for (let i = 0; i < P.SIZES.length; i++) {
      for (const s of P.planLayer(i, w, h, thin, paper(w, h), P.mulberry32(P.SEED))) {
        assert.ok(s.pts.every(Number.isFinite), `${w}x${h} size ${i}: a stroke has a non-number point`);
        n++;
      }
    }
    assert.ok(n > 0, `${w}x${h}: no strokes`);
  }
});

test("pp6. saved file name keeps the photo's name without characters Windows rejects", () => {
  assert.equal(P.pngName("holiday.jpg"), "holiday-painting.png");
  assert.equal(P.pngName("가족 사진.heic.png"), "가족 사진.heic-painting.png");
  assert.equal(P.pngName('a/b\\c:d*e?"f<g>h|i.png'), "a_b_c_d_e__f_g_h_i-painting.png");
  assert.equal(P.pngName(""), "painting.png");
  assert.equal(P.pngName(undefined), "painting.png");
});

// The page says the photo is never uploaded. This is a word check, not a proof: the tool's scripts
// must contain no fetch/XHR/WebSocket/beacon calls and no URLs, the page may load nothing but the
// site's shared files and fonts, and no picture may be bundled with it.
test("pp7. the tool's scripts contain no network calls or URLs, and no image is bundled", () => {
  const names = readdirSync(dir).sort();
  assert.deepEqual(names, ["app.js", "index.html", "painter.js", "style.css"]);
  for (const name of ["app.js", "painter.js"]) {
    const src = readFileSync(join(dir, name), "utf8");
    for (const word of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "import(", "http://", "https://"]) {
      assert.ok(!src.includes(word), `${name} contains ${word}`);
    }
  }
  for (const name of names) {
    assert.ok(!readFileSync(join(dir, name), "utf8").includes("data:image"), `${name} bundles an image`);
  }
  assert.ok(!/from\s+["'](?!\.\/painter\.js)/.test(readFileSync(join(dir, "app.js"), "utf8")), "app.js imports something else");
  // The page itself loads only its own files, the site's shared files, and the two site fonts.
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const loaded = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(loaded.length >= 6);
  for (const url of loaded) {
    assert.ok(/^(\.\.\/assets\/|app\.js$|style\.css$|https:\/\/cdn\.jsdelivr\.net(\/|$)|https:\/\/avatars\.githubusercontent\.com\/)/.test(url), `index.html loads ${url}`);
  }
  assert.ok(!/<form\b|<iframe\b|<img\b/.test(html), "index.html has a form, iframe or img");
});

test("pp9. Site.t puts a value in as it is, even when it looks like a pattern", () => {
  const src = readFileSync(join(root, "assets/site.js"), "utf8");
  const win = { STRINGS: { en: { k: "{name} · {w}px" }, ko: {} }, addEventListener() {} };
  const doc = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } };
  new Function("window", "document", "navigator", "localStorage", src)(win, doc, { language: "en" }, { getItem: () => null, setItem() {} });
  assert.equal(win.Site.t("k", { name: "$& {w}.png", w: 100 }), "$& {w}.png · 100px");
  assert.equal(win.Site.t("k", { name: "a" }), "a · {w}px");
});

test("pp8. every pp. string used by the page exists in both languages", () => {
  const box = { window: {} };
  new Function("window", readFileSync(join(root, "assets/i18n.js"), "utf8"))(box.window);
  const S = box.window.STRINGS;
  const used = new Set();
  for (const name of ["index.html", "app.js"]) {
    for (const m of readFileSync(join(dir, name), "utf8").matchAll(/["'](pp\.[A-Za-z0-9_]+)["']/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 30, `only ${used.size} keys found`);
  for (const k of used) for (const lang of ["en", "ko"]) assert.ok(S[lang][k], `${lang} is missing ${k}`);
  const defined = Object.keys(S.en).filter((k) => k.startsWith("pp."));
  for (const k of defined) assert.ok(used.has(k), `${k} is defined but not used`);
});

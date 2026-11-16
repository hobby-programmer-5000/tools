// Meme Maker logic and page checks. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../meme/meme.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

// A fake font: Latin 0.6 em, Hangul and other wide characters 1 em.
const measureAt = (size) => (s) => [...s].reduce((w, ch) => w + (/[ᄀ-￿]/.test(ch) ? 1 : 0.6) * size, 0);

test("mm1. fitText picks the largest size that fits; one size larger does not fit", () => {
  const cases = [
    ["ONE DOES NOT SIMPLY WALK INTO MORDOR", 600, 160, 200, 0.08],
    ["월요일 아침에 회의가 세 개 있다는 걸 알게 된 나", 500, 300, 120, 0.08],
    ["short", 400, 100, 40, 0],
    ["a\nb\nc\nd", 300, 200, 300, 0.1],
    ["아주길어서공백이하나도없는한국어문장도글자단위로줄바꿈된다", 240, 400, 90, 0],
  ];
  for (const [text, w, h, max, stroke] of cases) {
    const r = M.fitText(text, w, h, max, measureAt, stroke);
    assert.ok(r.fits, `${text} should fit`);
    assert.ok(r.size <= max);
    const m = measureAt(r.size), pad = 2 * stroke * r.size;
    for (const l of r.lines) assert.ok(m(l) <= w - pad, `"${l}" is wider than the box`);
    assert.ok(r.lines.length * r.size * M.LINE_HEIGHT + pad <= h);
    if (r.size < max) {
      const big = M.fitText(text, w, h, r.size + 1, measureAt, stroke);
      assert.equal(big.size, r.size, `size ${r.size + 1} should not fit "${text}"`);
    }
    // Nothing is lost when wrapping: same characters apart from spaces.
    assert.equal(r.lines.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  }
  assert.equal(M.fitText("short", 400, 100, 40, measureAt).size, 40, "stops at the max size");
});

test("mm1b. wrapLines keeps explicit line breaks and breaks a long word between characters", () => {
  const m = measureAt(10);
  assert.deepEqual(M.wrapLines("ab\n\ncd", 1000, m), ["ab", "", "cd"]);
  const lines = M.wrapLines("가나다라마바사아자차", 35, m);   // 3 wide characters per line
  assert.deepEqual(lines, ["가나다", "라마바", "사아자", "차"]);
  assert.deepEqual(M.wrapLines("aa bb cc", 25, m), ["aa", "bb", "cc"]);
  assert.deepEqual(M.wrapLines("aa bb", 1000, m), ["aa bb"]);
});

test("mm2. hit tests on rotated and flipped layers", () => {
  const L = { x: 100, y: 100, w: 200, h: 50, rot: Math.PI / 2, flip: true };
  assert.ok(M.contains(L, 100, 10));            // rotated a quarter turn: tall, thin
  assert.ok(!M.contains(L, 10, 100));
  for (const [px, py] of M.corners(L)) assert.ok(M.contains(L, px, py, 1e-6));
  for (const k of ["nw", "ne", "se", "sw"]) {
    const i = ["nw", "ne", "se", "sw"].indexOf(k);
    const [px, py] = M.corners(L)[i];
    assert.equal(M.handleAt(L, px + 2, py - 1, 8, 30), k);
  }
  const [rx, ry] = M.toCanvas(L, 0, -L.h / 2 - 30);   // rotate handle, above the top edge in layer space
  assert.equal(M.handleAt(L, rx, ry, 8, 30), "rot");
  assert.equal(M.handleAt(L, 100, 100, 8, 30), null);
  // Below the box when above would be off the canvas: found there, and no longer above.
  const [bx, by] = M.toCanvas(L, 0, L.h / 2 + 30);
  assert.equal(M.handleAt(L, bx, by, 8, 30, true), "rot");
  assert.equal(M.handleAt(L, rx, ry, 8, 30, true), null);
  // toLocal and toCanvas are inverses.
  const [u, v] = M.toLocal(L, 37, 151);
  const [x, y] = M.toCanvas(L, u, v);
  near(x, 37); near(y, 151);
});

test("mm2b. resizing keeps the opposite corner fixed; rotating snaps to 15 degrees", () => {
  const L = { x: 300, y: 200, w: 120, h: 80, rot: 0.6, flip: false };
  for (const [k, fixed] of [["se", 0], ["nw", 2], ["ne", 3], ["sw", 1]]) {
    const anchor = M.corners(L)[fixed];
    for (const keep of [false, true]) {
      const r = M.resizeFrom(L, k, 420, 330, keep);
      const after = M.corners({ ...L, ...r })[fixed];
      near(after[0], anchor[0], 1e-6); near(after[1], anchor[1], 1e-6);
      if (keep) near(r.w / r.h, L.w / L.h, 1e-9);
      assert.ok(r.w >= M.MIN_BOX && r.h >= M.MIN_BOX);
    }
  }
  const a = M.rotationTo({ x: 0, y: 0 }, 100, 0, false);
  near(a, Math.PI / 2);
  // A handle below the box points down at rotation 0.
  near(M.rotationTo({ x: 0, y: 0 }, 0, 100, false, true), 0);
  near(M.rotationTo({ x: 0, y: 0 }, 0, -100, false, false), 0);
  const snapped = M.rotationTo({ x: 0, y: 0 }, 100, -20, true);
  near(Math.round(snapped / (Math.PI / 12)) * (Math.PI / 12), snapped);
});

test("mm3. lasso inside/outside, concave shape included", () => {
  const C = [[0, 0], [100, 0], [100, 100], [60, 100], [60, 40], [40, 40], [40, 100], [0, 100]];   // a U
  assert.ok(M.pointInPolygon(C, 20, 80));
  assert.ok(M.pointInPolygon(C, 80, 80));
  assert.ok(!M.pointInPolygon(C, 50, 80), "the notch of the U is outside");
  assert.ok(M.pointInPolygon(C, 50, 20));
  assert.ok(!M.pointInPolygon(C, 150, 50));
  const b = M.shapeBounds({ type: "poly", pts: C, feather: 5 });
  assert.deepEqual(b, { x: -5, y: -5, w: 110, h: 110 });
  assert.deepEqual(M.shapeBounds({ type: "ellipse", cx: 50, cy: 40, rx: 20, ry: 10, feather: 0 }), { x: 30, y: 30, w: 40, h: 20 });
  assert.deepEqual(M.shapeBounds({ type: "stroke", pts: [[10, 10], [30, 20]], r: 4, feather: 1 }), { x: 5, y: 5, w: 30, h: 20 });
});

test("mm3b. cropping a layer to a box moves no pixel on the canvas", () => {
  for (const flip of [false, true]) {
    const L = { x: 400, y: 300, w: 300, h: 200, rot: 0.4, flip, crop: { x: 0, y: 0, w: 600, h: 400 } };
    const box = { x: 150, y: 100, w: 200, h: 120 };
    const C = M.cropTo(L, box);
    for (const [sx, sy] of [[150, 100], [350, 220], [200, 150]]) {
      const [ax, ay] = M.sourceToCanvas(L, sx, sy), [bx, by] = M.sourceToCanvas(C, sx, sy);
      near(ax, bx, 1e-9); near(ay, by, 1e-9);
      const [qx, qy] = M.toSource(C, bx, by);
      near(qx, sx, 1e-9); near(qy, sy, 1e-9);
    }
    near(C.w, 100); near(C.h, 60);
  }
});

// A synthetic handwriting photo: paper at 235, ink at 30, one grey edge pixel at 130.
function handwriting() {
  const w = 10, h = 4, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = Math.floor(i / w);
    const v = x >= 3 && x <= 5 && y >= 1 && y <= 2 ? 30 : 235;
    rgba.set([v, v, v, 255], i * 4);
  }
  rgba.set([130, 130, 130, 255], (1 * w + 6) * 4);
  return { w, h, rgba };
}

test("mm4. ink extraction: paper goes transparent, ink takes the color, edges fade", () => {
  const { w, h, rgba } = handwriting();
  const t = M.otsu(rgba);
  assert.ok(t > 30 && t < 235, `otsu ${t} should fall between ink and paper`);
  const out = M.extractInk(rgba, 180, 100, [200, 10, 20]);
  const a = (x, y) => out[(y * w + x) * 4 + 3];
  assert.equal(a(0, 0), 0, "paper is transparent");
  assert.equal(a(4, 1), 255, "ink is opaque");
  assert.equal(a(6, 1), 128, "an edge pixel between paper and ink is half opaque");   // (180-130)/100*255
  assert.deepEqual([...out.slice((1 * w + 4) * 4, (1 * w + 4) * 4 + 3)], [200, 10, 20]);
  assert.deepEqual(M.alphaBounds(out, w, h), { x: 3, y: 1, w: 4, h: 2 });
  assert.equal(M.alphaBounds(new Uint8ClampedArray(16), 2, 2), null);
});

test("mm5. cover color is the average of the ring around the box", () => {
  const w = 20, h = 20, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = Math.floor(i / w);
    const inside = x >= 5 && x < 15 && y >= 5 && y < 15;
    rgba.set(inside ? [0, 0, 0, 255] : x < 10 ? [100, 200, 50, 255] : [200, 100, 150, 255], i * 4);
  }
  // The ring of 3 px around the box is half one color, half the other.
  assert.deepEqual(M.borderAverage(rgba, w, h, { x: 5, y: 5, w: 10, h: 10 }, 3), [150, 150, 100]);
  // A box over the whole image has no ring: falls back to the inside.
  const one = new Uint8ClampedArray([10, 20, 30, 255]);
  assert.deepEqual(M.borderAverage(one, 1, 1, { x: 0, y: 0, w: 1, h: 1 }), [10, 20, 30]);
  assert.equal(M.toHex([150, 150, 100]), "#969664");
  assert.deepEqual(M.fromHex("#969664"), [150, 150, 100]);
});

test("mm6. undo and redo restore exact states and keep at most the limit", () => {
  const H = new M.History(5);
  const doc = (n) => ({ n, layers: [{ id: n, text: "t" + n }] });
  H.reset(doc(0));
  for (let i = 1; i <= 3; i++) H.push(doc(i));
  assert.deepEqual(H.undo(), doc(2));
  assert.deepEqual(H.undo(), doc(1));
  assert.deepEqual(H.redo(), doc(2));
  H.push(doc(9));                              // a new change drops the redo branch
  assert.equal(H.canRedo, false);
  assert.deepEqual(H.undo(), doc(2));
  for (let i = 10; i < 30; i++) H.push(doc(i));
  assert.equal(H.stack.length, 5);
  let n = 0;
  while (H.undo()) n++;
  assert.equal(n, 4);
  // Snapshots are copies: changing a returned state does not change history.
  const s = H.redo(); s.layers[0].text = "changed";
  assert.equal(H.stack[H.at].layers[0].text, "t26");
});

test("mm7. layer order, duplicate", () => {
  const ids = (ls) => ls.map((l) => l.id).join("");
  const ls = ["a", "b", "c", "d"].map((id) => ({ id, x: 0, y: 0 }));
  assert.equal(ids(M.moveLayer(ls, 1, "up")), "acbd");
  assert.equal(ids(M.moveLayer(ls, 1, "down")), "bacd");
  assert.equal(ids(M.moveLayer(ls, 0, "down")), "abcd");
  assert.equal(ids(M.moveLayer(ls, 3, "up")), "abcd");
  assert.equal(ids(M.moveLayer(ls, 2, "bottom")), "cabd");
  assert.equal(ids(M.moveLayer(ls, 0, "top")), "bcda");
  assert.equal(ids(ls), "abcd", "the input is not changed");
  const d = M.duplicateLayer([{ id: "a", x: 1, y: 2, base: true, locked: true }], 0, "z", 10);
  assert.deepEqual(d[1], { id: "z", x: 11, y: 12, base: false, locked: false, panel: false, caption: undefined });
});

test("mm8. caption bands and attached images give the right canvas size and positions", () => {
  let doc = { W: 600, H: 400, padTop: 0, padBottom: 0, layers: [{ id: "base", x: 300, y: 200 }] };
  doc = M.setCaptions(doc, 100, 0);
  assert.equal(doc.H, 500);
  assert.equal(doc.layers[0].y, 300, "the picture moves down below the band");
  doc.layers.push({ id: "cap", caption: "top", x: 300, y: 50 });
  doc = M.setCaptions(doc, 100, 80);
  assert.equal(doc.H, 580);
  doc.layers.push({ id: "capb", caption: "bottom", x: 300, y: 540 });
  const { doc: d2, box } = M.attachBelow(doc, 300, 100);    // scaled to 600 wide: 200 tall
  assert.equal(d2.H, 780);
  assert.deepEqual(box, { x: 300, y: 600, w: 600, h: 200 });
  assert.equal(d2.layers.find((l) => l.id === "capb").y, 740, "bottom caption text moves below the new image");
  assert.equal(d2.layers.find((l) => l.id === "base").y, 300);
  const d3 = M.setCaptions(d2, 0, 80);
  assert.equal(d3.H, 680);
  assert.ok(!d3.layers.some((l) => l.id === "cap"), "caption text goes with its band");
  assert.equal(d3.layers.find((l) => l.id === "base").y, 200);
  assert.equal(d3.layers.find((l) => l.id === "capb").y, 640);
  assert.deepEqual(M.fitSize(8000, 2000, 4096), [4096, 1024]);
  assert.deepEqual(M.fitSize(300, 200, 4096), [300, 200]);
  const [aw, ah] = M.fitSize(4096, 4096, 4096, M.MAX_AREA);
  assert.ok(aw * ah <= M.MAX_AREA && aw === ah, "a square background is capped by area");
});

test("mm9. text is drawn only in system fonts, and the page has its parts", () => {
  for (const f of Object.values(M.FONTS)) assert.ok(!/Pretendard|Galmuri|var\(/.test(f.stack), f.stack);
  const app = readFileSync(join(root, "meme/app.js"), "utf8");
  assert.ok(!/Pretendard|Galmuri/.test(app), "app.js names a web font");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(app + readFileSync(join(root, "meme/meme.js"), "utf8")), "no network calls");
  // Inputs that hold typed text and lists that show it use system fonts.
  const css = readFileSync(join(root, "meme/style.css"), "utf8");
  const at = css.indexOf(".mm-user {");
  assert.ok(at >= 0, "style.css has no .mm-user rule");
  assert.ok(/font-family:\s*system-ui/.test(css.slice(at, css.indexOf("}", at))));
  const html = readFileSync(join(root, "meme/index.html"), "utf8");
  for (const id of ["text-input", "layers"]) assert.ok(new RegExp(`id="${id}"[^>]*class="[^"]*mm-user|class="[^"]*mm-user[^"]*"[^>]*id="${id}"`).test(html), `#${id} is not .mm-user`);
  assert.equal(M.pngName(new Date(2026, 10, 16, 9, 5, 7)), "meme-20261116-090507.png");
});

test("mm10. every mm. string used by the page exists in both languages", () => {
  const box = { window: {} };
  new Function("window", readFileSync(join(root, "assets/i18n.js"), "utf8"))(box.window);
  const S = box.window.STRINGS;
  const used = new Set();
  for (const f of ["meme/index.html", "meme/app.js"]) for (const m of readFileSync(join(root, f), "utf8").matchAll(/"(mm\.\w+)"/g)) used.add(m[1]);
  assert.ok(used.size > 100, `only ${used.size} keys found`);
  for (const k of used) for (const l of ["en", "ko"]) assert.ok(S[l][k], `${l}.${k} is missing`);
});

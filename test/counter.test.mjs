// Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Load the same vendored bundle the browser loads.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, "vendor/twitter-text-3.1.0.bundle.js"), "utf8") + ";this.tt = twttrText;", ctx);
const tt = ctx.tt;
const { analyze, breakdown, LIMITS } = require(join(root, "x-counter/counter.js"))(tt);

const official = (s, limit = 280) =>
  tt.parseTweet(s.normalize("NFC"), Object.assign({}, tt.configs.defaults, { maxWeightedTweetLength: limit }));

test("1. latin: 280 fits, 281 is over", () => {
  const a = analyze("a".repeat(280));
  assert.equal(a.weighted, 280);
  assert.equal(a.over, false);
  assert.equal(a.valid, true);
  const b = analyze("a".repeat(281));
  assert.equal(b.weighted, 281);
  assert.equal(b.over, true);
  assert.equal(b.remaining, -1);
});

test("2. Hangul counts 2: 140 fits (280), 141 is over (282)", () => {
  assert.equal(analyze("가".repeat(140)).weighted, 280);
  assert.equal(analyze("가".repeat(140)).over, false);
  const b = analyze("가".repeat(141));
  assert.equal(b.weighted, 282);
  assert.equal(b.over, true);
  assert.equal(b.parts.double, 141);
});

test("3. links count 23 whatever their length, bare domains too", () => {
  assert.equal(analyze("https://example.com/" + "x".repeat(200)).weighted, 23);
  assert.equal(analyze("example.com").weighted, 23);
  const a = analyze("see https://example.com/a and naver.com");
  assert.equal(a.parts.links, 2);
  assert.equal(a.weighted, "see ".length + 23 + " and ".length + 23);
});

test("4. emoji count 2, including joined sequences", () => {
  for (const e of ["👍", "👍🏽", "👨‍👩‍👧‍👦", "🏳️‍🌈", "🇰🇷"]) {
    const a = analyze(e);
    assert.equal(a.weighted, 2, e);
    assert.equal(a.parts.emoji, 1, e);
  }
});

// A small seeded generator so a failure can be reproduced.
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const POOL = [
  "a", "Z", "7", " ", "\n", ".", "!", "é", "ß", "Ω", "Я", "가", "힣", "ㄱ", "あ", "カ", "中", "文",
  "…", "—", "“", "”", "‘", "€", "→", "★", "👍", "😂", "👨‍👩‍👧‍👦", "🇰🇷", "❤️", "𝐀", "𠜎",
  "가", // decomposed Hangul (NFD), as macOS can produce
  " https://example.com/path?q=1 ", " github.com ", " x.com/meme_n_chaos ", " @meme_n_chaos ", " #hobby ",
];

test("5. breakdown always adds up to the official count (fixed + 500 random strings)", () => {
  const fixed = [
    "", "hello", "안녕하세요", "Hello 세계 👋", "café", "é", "line\nbreak", "https://a.co/b",
    "한국어 English 日本語 中文 😂 https://example.com", "…—“”", "𝐀𝐁𝐂", "각",
  ];
  const r = rng(42);
  const random = Array.from({ length: 500 }, () =>
    Array.from({ length: 1 + Math.floor(r() * 60) }, () => POOL[Math.floor(r() * POOL.length)]).join(""));
  let checked = 0;
  for (const s of [...fixed, ...random]) {
    const a = analyze(s);
    assert.equal(a.weighted, official(s).weightedLength, JSON.stringify(s));
    assert.equal(a.parts.weighted, a.weighted, "breakdown sum for " + JSON.stringify(s));
    const sum = a.parts.single + a.parts.double * 2 + a.parts.otherUnits + a.parts.links * 23 + a.parts.emoji * 2;
    assert.equal(sum, a.weighted, "category sum for " + JSON.stringify(s));
    checked++;
  }
  assert.equal(checked, fixed.length + 500); // a check over zero strings would prove nothing
});

test("6. the cut point matches parseTweet's validRangeEnd", () => {
  const s = "가".repeat(150);
  const a = analyze(s);
  assert.equal(a.cutAt, official(s).validRangeEnd + 1);
  assert.equal(a.cutAt, 140);
  assert.equal(analyze("짧은 글").cutAt, -1);
  const mixed = "x".repeat(270) + " https://example.com 끝";
  const m = analyze(mixed);
  assert.equal(m.cutAt, official(mixed).validRangeEnd + 1);
  assert.ok(m.text.slice(0, m.cutAt).length < mixed.length);
});

test("6b. cut point matches validRangeEnd on 300 random over-limit strings", () => {
  const r = rng(7);
  const pool = POOL.filter((x) => !/[\uFFFE\uFEFF\uFFFF]/.test(x));
  let checked = 0;
  while (checked < 300) {
    const s = Array.from({ length: 120 + Math.floor(r() * 200) }, () => pool[Math.floor(r() * pool.length)]).join("");
    const a = analyze(s);
    if (!a.over) continue;
    assert.equal(a.cutAt, official(s).validRangeEnd + 1, JSON.stringify(s));
    checked++;
  }
  assert.equal(checked, 300);
});

test("6c. a character X rejects does not move the cut point to the front", () => {
  const bom = analyze("\uFEFF" + "b".repeat(300));
  assert.equal(bom.invalid, true);
  assert.equal(bom.over, true);
  assert.equal(bom.cutAt, 279); // the BOM weighs 2, then 278 b's fit
  const mid = analyze("a".repeat(10) + "\uFFFE" + "b".repeat(300));
  assert.equal(mid.invalid, true);
  assert.equal(mid.cutAt, 279);
  assert.equal(analyze("ok\uFFFF").invalid, true);
  assert.equal(analyze("ok").invalid, false);
});

test("6d. spaces only: not empty, but blank", () => {
  const a = analyze(" ".repeat(300));
  assert.equal(a.empty, false);
  assert.equal(a.blank, true);
  assert.equal(a.over, true);
  assert.equal(a.cutAt, 280);
  assert.equal(analyze("").empty, true);
  assert.equal(analyze("").blank, false);
});

test("7. Premium: 25,000 fits, 25,001 is over", () => {
  assert.equal(LIMITS.premium, 25000);
  assert.equal(analyze("a".repeat(25000), LIMITS.premium).over, false);
  assert.equal(analyze("a".repeat(25000), LIMITS.premium).valid, true);
  assert.equal(analyze("a".repeat(25001), LIMITS.premium).over, true);
});

test("8a. i18n: English and Korean have the same keys, none empty", () => {
  const src = readFileSync(join(root, "assets/i18n.js"), "utf8");
  const box = { window: {} };
  vm.createContext(box);
  vm.runInContext(src, box);
  const S = box.window.STRINGS;
  const en = Object.keys(S.en).sort();
  const ko = Object.keys(S.ko).sort();
  assert.deepEqual(ko, en);
  for (const l of ["en", "ko"]) for (const k of en) assert.ok(String(S[l][k]).trim(), `${l}.${k} is empty`);
  assert.ok(en.length > 10);
});

test("8b. every tool in tools.json has a page", () => {
  const tools = JSON.parse(readFileSync(join(root, "tools.json"), "utf8")).tools;
  assert.ok(tools.length >= 1);
  for (const t of tools) {
    assert.match(t.slug, /^[a-z0-9-]+$/);
    assert.ok(existsSync(join(root, t.slug, "index.html")), `${t.slug}/index.html`);
    for (const l of ["en", "ko"]) {
      assert.ok(t.name?.[l], `${t.slug} name.${l}`);
      assert.ok(t.summary?.[l], `${t.slug} summary.${l}`);
      assert.ok(Array.isArray(t.tags?.[l]), `${t.slug} tags.${l}`);
    }
  }
});

test("8c. scrollfold page has its files", () => {
  for (const f of ["index.html", "style.css", "app.js", "split.js"])
    assert.ok(existsSync(join(root, "scrollfold", f)), `scrollfold/${f}`);
});

test("8d. scrollfold split.js: 2003 px into 20 equal, touching 100 px strips", async () => {
  const S = await import("../scrollfold/split.js");
  const boxes = S.stripBoxes(2003, 500, 20);
  assert.equal(boxes.length, 20);
  for (const [x0, , x1] of boxes) assert.equal(x1 - x0, 100);
  for (let i = 1; i < 20; i++) assert.equal(boxes[i][0], boxes[i - 1][2]);
  assert.equal(S.suggestCount(2500, 500, S.RATIOS["1:2"]), 10);
});

test("breakdown() works on its own for empty text", () => {
  assert.deepEqual(
    { ...breakdown(""), weighted: 0 },
    { single: 0, double: 0, other: 0, otherUnits: 0, links: 0, emoji: 0, units: 0, cutAt: -1, weighted: 0 });
});

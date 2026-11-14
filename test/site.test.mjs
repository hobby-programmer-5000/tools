// Site-wide checks. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function files(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// The X logo next to a tool name read as if X made or endorsed the tool (removed 2026-11-14).
// Tools may name the service they work with, but never show its logo.
test("no tool page shows the X logo", () => {
  const pages = files(root, [".html", ".svg", ".js", ".css"]);
  assert.ok(pages.length >= 5);
  const xLogoPath = "M14.234 10.162"; // start of the X mark's SVG path
  for (const f of pages) {
    const src = readFileSync(f, "utf8");
    const where = relative(root, f);
    assert.ok(!/#i-x["']/.test(src) && !/id=["']i-x["']/.test(src), `${where} uses the i-x icon`);
    assert.ok(!src.includes(xLogoPath), `${where} contains the X logo path`);
  }
});

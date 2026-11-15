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

// User text (a file name, a folder name) must never be drawn in the web fonts: they are split by
// Unicode range, so new characters would fetch new font files, which hints at the text.
test("status lines that show file names use system fonts, and toasts carry no file name", () => {
  const rules = [["scrollfold/style.css", ".sf-status {"], ["scrollfold/style.css", ".file-name {"], ["photo-painter/style.css", ".file-name, .pp-status {"]];
  for (const [file, selector] of rules) {
    const css = readFileSync(join(root, file), "utf8");
    const at = css.indexOf(selector);
    assert.ok(at >= 0, `${file} has no ${selector} rule`);
    const body = css.slice(at, css.indexOf("}", at));
    assert.ok(/font-family:\s*system-ui/.test(body), `${file} ${selector} does not use system fonts`);
    assert.ok(!body.includes("var(--font)") && !body.includes("Pretendard"), `${file} ${selector} uses a web font`);
  }
  const apps = files(root, ["app.js"]);
  assert.ok(apps.length >= 3);
  let toasts = 0;
  for (const f of apps) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?<![\w$"'#])toast\(([^\n]*)/g)) {
      toasts++;
      // The text may only be fixed strings: t("key") with no values, or a choice between two of them.
      const text = m[1].replace(/t\("[\w.]+"\)/g, "").split(/[,)]/)[0];
      assert.ok(/^[\w\s?:]*$/.test(text) && !/status|name|file|text/i.test(text),
        `${relative(root, f)}: toast text is not a fixed string: ${m[1].slice(0, 60)}`);
    }
  }
  assert.ok(toasts >= 5, `only ${toasts} toast calls found`);
});

// Dropping a file outside a drop zone makes the browser open it and lose the page.
test("pages that take a dropped file catch drops anywhere on the page", () => {
  for (const name of ["scrollfold/app.js", "photo-painter/app.js"]) {
    const src = readFileSync(join(root, name), "utf8");
    assert.ok(/window\.addEventListener\("dragover"/.test(src) && /window\.addEventListener\("drop"/.test(src), `${name} does not handle drops on the window`);
  }
});

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

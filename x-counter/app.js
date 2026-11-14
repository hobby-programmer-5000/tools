// X post length counter page. Counting itself lives in counter.js (tested in Node).
// Nothing here talks to the network: the text only goes to localStorage as a draft.

(function () {
  const { t, toast, store } = window.Site;
  const X = window.XCounter;
  const $ = (s) => document.querySelector(s);
  const KEY_DRAFT = "x-counter:draft";
  const KEY_LIMIT = "x-counter:limit";

  const text = $("#text");
  let limit = X.LIMITS.standard;
  let wasOver = false;
  let last = null;
  let undoText = null; // text removed by Clear, until the user types again

  const fmt = (n) => n.toLocaleString(window.Site.lang === "ko" ? "ko-KR" : "en-US");

  function setTile(id, value, detail) {
    const n = $(id);
    n.replaceChildren(document.createTextNode(fmt(value)));
    if (detail) {
      const s = document.createElement("small");
      s.textContent = " " + detail;
      n.append(s);
    }
  }

  function renderCut(a) {
    const box = $("#cut");
    if (!a.over) { box.hidden = true; return; }
    box.hidden = false;
    // Keep the preview focused on the cut: show the end of the part that fits.
    const keptFull = a.text.slice(0, a.cutAt);
    let from = Math.max(0, keptFull.length - 240);
    // Don't start in the middle of a surrogate pair (emoji, 𝐀, rare Hanja).
    const unit = keptFull.charCodeAt(from);
    if (unit >= 0xdc00 && unit <= 0xdfff) from += 1;
    const kept = from > 0 ? "…" + keptFull.slice(from) : keptFull;
    const mark = document.createElement("mark");
    mark.textContent = a.text.slice(a.cutAt);
    const scissors = document.createElement("span");
    scissors.className = "scissors";
    scissors.setAttribute("aria-hidden", "true");
    scissors.textContent = "✂";
    $("#cut-preview").replaceChildren(document.createTextNode(kept), scissors, mark);
  }

  function render() {
    const a = X.analyze(text.value, limit);
    last = a;
    $("#count").textContent = fmt(a.weighted);
    $("#limit").textContent = fmt(limit);

    const remain = $("#remain");
    const bar = $("#bar");
    const state = a.empty ? "idle" : a.over ? "over" : a.weighted / limit >= 0.9 ? "warn" : "ok";
    remain.className = "remain " + state;
    bar.className = "bar " + state;
    remain.textContent = a.empty ? t("xc.empty") : a.over ? t("xc.over", { n: fmt(-a.remaining) }) : t("xc.left", { n: fmt(a.remaining) });
    bar.firstElementChild.style.width = (a.ratio * 100).toFixed(2) + "%";
    bar.setAttribute("aria-valuemax", String(limit));
    bar.setAttribute("aria-valuenow", String(Math.min(a.weighted, limit)));
    bar.setAttribute("aria-valuetext", remain.textContent);

    // Problems X would refuse to post, whatever the length.
    const problem = a.invalid ? t("xc.invalid") : a.blank ? t("xc.blank") : "";
    $("#invalid").textContent = problem;
    $("#invalid").hidden = !problem;

    const p = a.parts;
    setTile("#p-single", p.single + p.otherUnits);
    setTile("#p-double", p.double * 2, p.double ? t("xc.chars", { n: fmt(p.double) }) : "");
    setTile("#p-links", p.links * 23, p.links ? t("xc.items", { n: fmt(p.links), w: 23 }) : "");
    setTile("#p-emoji", p.emoji * 2, p.emoji ? t("xc.items", { n: fmt(p.emoji), w: 2 }) : "");

    renderCut(a);

    if (a.over !== wasOver) {
      $("#sr-live").textContent = a.over ? t("xc.srOver") : t("xc.srFits");
      wasOver = a.over;
    }
  }

  let frame = 0;
  let saveTimer;
  function onInput() {
    if (undoText !== null) {
      undoText = null; // typing after Clear makes Undo stale; never overwrite new text
      const tn = $("#toast");
      if (tn.querySelector("button")) tn.hidden = true;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY_DRAFT, text.value), 300);
  }

  async function copy() {
    if (!text.value) return;
    try {
      await navigator.clipboard.writeText(text.value);
      toast(t("xc.copied"));
    } catch (e) {
      // Older or locked-down browsers: fall back to selecting the text.
      text.focus();
      text.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      toast(ok ? t("xc.copied") : t("xc.copyFail"));
    }
  }

  function undo() {
    if (undoText === null || text.value) return;
    text.value = undoText;
    undoText = null;
    store.set(KEY_DRAFT, text.value);
    render();
    text.focus();
  }

  function clear() {
    if (!text.value) return;
    undoText = text.value;
    text.value = "";
    store.set(KEY_DRAFT, "");
    render();
    text.focus();
    // Undo is also Ctrl+Z in the empty box, and the toast button comes right after Clear in tab order.
    toast(t("xc.cleared"), { label: t("xc.undo"), run: undo });
  }

  // Restore the draft and the chosen limit.
  const saved = Number(store.get(KEY_LIMIT));
  if (saved === X.LIMITS.premium) {
    limit = saved;
    document.querySelector('input[name="limit"][value="25000"]').checked = true;
  }
  text.value = store.get(KEY_DRAFT) || "";

  for (const r of document.querySelectorAll('input[name="limit"]')) {
    r.addEventListener("change", () => {
      limit = Number(r.value);
      store.set(KEY_LIMIT, String(limit));
      render();
    });
  }
  text.addEventListener("input", onInput);
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); copy(); }
    // Setting the value from code wipes the browser's own undo history, so handle Ctrl+Z after Clear.
    if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey && undoText !== null && !text.value) {
      e.preventDefault();
      undo();
    }
  });
  $("#copy").addEventListener("click", copy);
  $("#clear").addEventListener("click", clear);

  // Re-render numbers and messages in the new language.
  window.Site.onChange(() => { if (last) render(); });
  document.addEventListener("DOMContentLoaded", render);
})();

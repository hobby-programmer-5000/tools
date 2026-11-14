// Tool list on /tools/, built from tools.json (the same file the landing page reads).

(function () {
  let tools = null;
  let failed = false;
  const list = () => document.getElementById("list");

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  }

  function render() {
    const { t, lang } = window.Site;
    if (failed) { list().replaceChildren(el("p", { class: "muted", text: t("catalog.loadFail") })); return; }
    if (!tools) return;
    if (!tools.length) { list().replaceChildren(el("p", { class: "muted", text: t("catalog.empty") })); return; }
    list().replaceChildren(...tools.map((tool) =>
      el("article", { class: "card" },
        el("h2", {}, el("a", { href: `${tool.slug}/`, text: tool.name[lang] || tool.name.en })),
        el("p", { text: tool.summary[lang] || tool.summary.en }),
        el("div", { class: "tags" }, ...((tool.tags && (tool.tags[lang] || tool.tags.en)) || []).map((g) => el("span", { text: g }))))));
  }

  window.Site.onChange(render);
  fetch("tools.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { tools = d.tools; render(); })
    .catch(() => { failed = true; render(); });
})();

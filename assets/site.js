// Shared page shell: language and theme switches, string lookup, toast.
// Pages call Site.onChange(fn) to re-render their own parts when the language changes.

(function () {
  const S = window.STRINGS;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  // Shared with the landing page, which uses the same keys on the same origin.
  let lang = store.get("lang") || ((navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en");
  const listeners = [];
  const $ = (s) => document.querySelector(s);

  function t(key, vars) {
    let s = (S[lang] && S[lang][key]) ?? S.en[key] ?? key;
    // One pass with a function: a value such as a file name may itself contain "$&" or "{w}".
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }

  function applyLang() {
    document.documentElement.lang = lang;
    for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll("[data-i18n-placeholder]")) n.placeholder = t(n.dataset.i18nPlaceholder);
    for (const n of document.querySelectorAll("[data-i18n-label]")) n.setAttribute("aria-label", t(n.dataset.i18nLabel));
    const title = document.querySelector("[data-i18n-title]");
    if (title) document.title = t(title.dataset.i18nTitle) + " · hp5000 tools";
    $("#lang-label").textContent = lang === "en" ? "KO" : "EN";
    $("#lang").setAttribute("aria-label", t("site.langBtn"));
    $("#lang").title = t("site.langBtn");
    applyTheme(false);
    for (const fn of listeners) fn(lang);
  }

  const THEMES = ["auto", "light", "dark"];
  function applyTheme(save = true) {
    const th = document.documentElement.dataset.theme || "auto";
    // Icons live in assets/icons.svg; keep the page's relative path and swap the symbol.
    const use = $("#theme-icon");
    const file = use.getAttribute("href").split("#")[0];
    use.setAttribute("href", file + "#i-" + { auto: "monitor", light: "sun", dark: "moon" }[th]);
    const label = t({ auto: "site.themeAuto", light: "site.themeLight", dark: "site.themeDark" }[th]);
    $("#theme").setAttribute("aria-label", label);
    $("#theme").title = label;
    if (save) store.set("theme", th);
  }

  let toastTimer;
  function toast(msg, action) {
    const n = $("#toast");
    n.replaceChildren(document.createTextNode(msg));
    if (action) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = action.label;
      b.addEventListener("click", () => { n.hidden = true; action.run(); });
      n.append(b);
    }
    n.hidden = false;
    const ms = action ? 8000 : 2400;
    const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, ms); };
    // Don't take the toast away while someone is on it (keyboard focus or pointer).
    const hide = () => { if (n.contains(document.activeElement) || n.matches(":hover")) arm(); else n.hidden = true; };
    arm();
  }

  window.Site = {
    t, toast, store,
    get lang() { return lang; },
    onChange(fn) { listeners.push(fn); },
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("#lang").addEventListener("click", () => { lang = lang === "en" ? "ko" : "en"; store.set("lang", lang); applyLang(); });
    $("#theme").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || "auto";
      document.documentElement.dataset.theme = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      applyTheme();
    });
    applyLang();
  });
})();

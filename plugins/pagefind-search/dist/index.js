/**
 * pagefind-search — Quartz v5 component (plain ESM, no build step).
 * Mirrors ./plugins/search toolbar placement + Ctrl/Cmd+K modal UX,
 * backed by Pagefind's browser API and heading sub_results.
 */
import { h } from "preact"

const defaultOptions = {
  enablePreview: false,
  resultLimit: 12,
}

const css = `
.search {
  flex-grow: 1;
  min-width: 0;
}
.search > .search-button {
  background-color: transparent;
  border: 1px var(--lightgray) solid;
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
  height: 2rem;
  padding: 0 1rem 0 0;
  display: flex;
  align-items: center;
  text-align: inherit;
  cursor: pointer;
  white-space: nowrap;
  width: 100%;
}
.search > .search-button > p {
  display: inline;
  color: var(--gray);
}
.search > .search-button svg {
  width: 18px;
  min-width: 18px;
  margin: 0 0.5rem;
}
.search > .search-button svg .search-path {
  stroke: var(--darkgray);
  stroke-width: 1.5px;
  fill: none;
}
.search > .search-container {
  position: fixed;
  z-index: var(--search-z-index, 999);
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  overflow-y: auto;
  display: none;
  backdrop-filter: blur(4px);
  background: rgba(0, 0, 0, 0.25);
}
.search > .search-container.active {
  display: block;
}
.search > .search-container > .search-space {
  width: min(720px, 92vw);
  margin: 10vh auto 2rem;
}
@media (max-width: 600px) {
  .search > .search-container > .search-space {
    width: 100vw;
    margin: 0;
    min-height: 100vh;
  }
}
.search .search-bar {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--lightgray);
  border-radius: 7px 7px 0 0;
  padding: 0.85rem 1rem;
  font: inherit;
  background: var(--light);
  color: var(--darkgray);
}
.search .search-layout {
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-top: none;
  border-radius: 0 0 7px 7px;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  box-shadow: 0 14px 50px rgba(27, 33, 48, 0.12);
}
@media (max-width: 600px) {
  .search .search-bar { border-radius: 0; }
  .search .search-layout {
    border-radius: 0;
    max-height: calc(100vh - 3.2rem);
    min-height: calc(100vh - 3.2rem);
  }
}
.search .pf-hint {
  padding: 0.75rem 1rem;
  color: var(--gray);
  font-size: 0.9rem;
}
.search .pf-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--lightgray);
}
.search .pf-chip {
  border: 1px solid var(--lightgray);
  background: transparent;
  color: var(--darkgray);
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.search .pf-chip.active {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--light);
}
.search .pf-group {
  padding: 0.65rem 1rem 0.35rem;
  border-top: 1px solid var(--lightgray);
}
.search .pf-group-title {
  font-weight: 600;
  color: var(--dark);
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}
.search .pf-sub {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.2rem;
}
.search .pf-sub:hover,
.search .pf-sub.focus {
  background: var(--highlight);
}
.search .pf-sub-title {
  color: var(--secondary);
  font-size: 0.9rem;
  margin: 0 0 0.15rem;
}
.search .pf-excerpt {
  margin: 0;
  font-size: 0.85rem;
  color: var(--darkgray);
  line-height: 1.35;
}
.search .pf-excerpt mark {
  background: var(--textHighlight);
  color: inherit;
  padding: 0 0.1em;
}
.search .pf-empty {
  padding: 1rem;
  color: var(--gray);
}
`

const inlineScript = `
(() => {
  const LIMIT = 12;
  const cleanups = [];
  let pagefind = null;
  let activeFilter = { section: null, type: null };

  function basePath() {
    return document.body?.dataset?.basepath ?? "";
  }
  function withBase(url) {
    if (!url) return url;
    if (url.startsWith("http") || url.startsWith("//")) return url;
    const b = basePath();
    if (!b) return url;
    if (url.startsWith(b)) return url;
    return b + (url.startsWith("/") ? url : "/" + url);
  }
  function pagefindUrl() {
    return withBase("/pagefind/pagefind.js");
  }

  async function ensurePagefind() {
    if (pagefind) return pagefind;
    const mod = await import(pagefindUrl());
    pagefind = mod;
    if (typeof pagefind.init === "function") pagefind.init();
    return pagefind;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function bindOne(root) {
    const container = root.querySelector(".search-container");
    const button = root.querySelector(".search-button");
    const input = root.querySelector(".search-bar");
    const layout = root.querySelector(".search-layout");
    if (!container || !button || !input || !layout) return;

    const sidebar = root.closest(".sidebar");
    let focusIdx = -1;
    let links = [];

    function close() {
      container.classList.remove("active");
      button.setAttribute("aria-expanded", "false");
      if (sidebar) sidebar.style.zIndex = "";
      input.value = "";
      clear(layout);
      focusIdx = -1;
      links = [];
      button.focus();
    }
    function open() {
      container.classList.add("active");
      button.setAttribute("aria-expanded", "true");
      if (sidebar) sidebar.style.zIndex = "9999";
      input.focus();
      ensurePagefind().catch(() => {});
      if (!layout.childElementCount) {
        const hint = document.createElement("div");
        hint.className = "pf-hint";
        hint.textContent = "Search positions, Q&A, glossary. Type a term — results jump to the heading.";
        layout.appendChild(hint);
      }
    }

    function setFocus(i) {
      links.forEach((a) => a.classList.remove("focus"));
      focusIdx = i;
      if (focusIdx >= 0 && focusIdx < links.length) {
        links[focusIdx].classList.add("focus");
        links[focusIdx].scrollIntoView({ block: "nearest" });
      }
    }

    async function renderFilters(pf) {
      let filters;
      try { filters = await pf.filters(); } catch { return null; }
      const bar = document.createElement("div");
      bar.className = "pf-filters";
      const sections = Object.keys(filters?.section || {}).sort();
      const types = Object.keys(filters?.type || {}).sort();
      function chip(kind, value) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pf-chip" + (activeFilter[kind] === value ? " active" : "");
        b.textContent = value;
        b.addEventListener("click", () => {
          activeFilter[kind] = activeFilter[kind] === value ? null : value;
          input.dispatchEvent(new Event("input"));
        });
        return b;
      }
      for (const s of sections) bar.appendChild(chip("section", s));
      for (const t of types) bar.appendChild(chip("type", t));
      return bar.childElementCount ? bar : null;
    }

    async function runSearch(q) {
      clear(layout);
      links = [];
      focusIdx = -1;
      const trimmed = q.trim();
      if (!trimmed) {
        const hint = document.createElement("div");
        hint.className = "pf-hint";
        hint.textContent = "Type to search.";
        layout.appendChild(hint);
        return;
      }
      let pf;
      try { pf = await ensurePagefind(); }
      catch {
        const err = document.createElement("div");
        err.className = "pf-empty";
        err.textContent = "Search index missing. Build with pagefind postbuild.";
        layout.appendChild(err);
        return;
      }
      const filterBar = await renderFilters(pf);
      if (filterBar) layout.appendChild(filterBar);

      const opts = { filters: {} };
      if (activeFilter.section) opts.filters.section = activeFilter.section;
      if (activeFilter.type) opts.filters.type = activeFilter.type;
      const hasFilters = Object.keys(opts.filters).length > 0;
      const search = await pf.debouncedSearch(trimmed, hasFilters ? opts : undefined);
      if (search === null) return;
      const slice = search.results.slice(0, LIMIT);
      if (!slice.length) {
        const empty = document.createElement("div");
        empty.className = "pf-empty";
        empty.textContent = "No results. Try another term.";
        layout.appendChild(empty);
        return;
      }
      const data = await Promise.all(slice.map((r) => r.data()));
      for (const item of data) {
        const group = document.createElement("div");
        group.className = "pf-group";
        const title = document.createElement("div");
        title.className = "pf-group-title";
        title.textContent = item.meta?.title || item.url;
        group.appendChild(title);

        const subs = (item.sub_results && item.sub_results.length)
          ? item.sub_results.slice(0, 6)
          : [{ title: item.meta?.title || "Page", url: item.url, excerpt: item.excerpt }];

        for (const sub of subs) {
          const a = document.createElement("a");
          a.className = "pf-sub";
          a.href = withBase(sub.url);
          const st = document.createElement("div");
          st.className = "pf-sub-title";
          st.textContent = sub.title || "Section";
          const ex = document.createElement("p");
          ex.className = "pf-excerpt";
          ex.innerHTML = sub.excerpt || item.excerpt || "";
          a.appendChild(st);
          a.appendChild(ex);
          a.addEventListener("click", (ev) => {
            if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
            sessionStorage.setItem("search-term", trimmed);
            close();
          });
          group.appendChild(a);
          links.push(a);
        }
        layout.appendChild(group);
      }
      if (links.length) setFocus(0);
    }

    const onBtn = (e) => { e.stopPropagation(); open(); };
    button.addEventListener("click", onBtn);
    cleanups.push(() => button.removeEventListener("click", onBtn));

    let t = null;
    const onInput = () => {
      clearTimeout(t);
      const v = input.value;
      t = setTimeout(() => runSearch(v), 180);
      ensurePagefind().then((pf) => pf.preload?.(input.value));
    };
    input.addEventListener("input", onInput);
    cleanups.push(() => input.removeEventListener("input", onInput));

    const onKey = (e) => {
      if (!container.classList.contains("active")) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setFocus(Math.min(focusIdx + 1, links.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocus(Math.max(focusIdx - 1, 0)); return; }
      if (e.key === "Enter" && focusIdx >= 0 && links[focusIdx]) {
        e.preventDefault();
        sessionStorage.setItem("search-term", input.value.trim());
        const href = links[focusIdx].href;
        close();
        window.location.assign(href);
      }
    };
    input.addEventListener("keydown", onKey);
    cleanups.push(() => input.removeEventListener("keydown", onKey));

    const onDocKey = (e) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (container.classList.contains("active")) close();
        else open();
      }
    };
    document.addEventListener("keydown", onDocKey);
    cleanups.push(() => document.removeEventListener("keydown", onDocKey));

    const onBackdrop = (e) => {
      if (e.target === container) close();
    };
    container.addEventListener("click", onBackdrop);
    cleanups.push(() => container.removeEventListener("click", onBackdrop));
  }

  function highlightFromSession() {
    const term = sessionStorage.getItem("search-term");
    if (!term) return;
    sessionStorage.removeItem("search-term");
    // Prefer hash target; else first text match in article
    requestAnimationFrame(() => {
      const hash = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (hash) {
        hash.scrollIntoView({ block: "center", behavior: "instant" });
        hash.classList.add("search-scroll-target");
        setTimeout(() => hash.classList.remove("search-scroll-target"), 2000);
        return;
      }
      const article = document.querySelector("article.popover-hint");
      if (!article) return;
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      const lower = term.toLowerCase();
      let node;
      while ((node = walker.nextNode())) {
        const idx = (node.nodeValue || "").toLowerCase().indexOf(lower);
        if (idx === -1) continue;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + term.length);
        const span = document.createElement("span");
        span.className = "search-scroll-target";
        try {
          range.surroundContents(span);
          span.scrollIntoView({ block: "center", behavior: "instant" });
          setTimeout(() => {
            const parent = span.parentNode;
            if (parent) {
              parent.replaceChild(document.createTextNode(span.textContent || ""), span);
              parent.normalize();
            }
          }, 2000);
        } catch { /* ignore */ }
        break;
      }
    });
  }

  function boot() {
    while (cleanups.length) {
      try { cleanups.pop()(); } catch { /* ignore */ }
    }
    document.querySelectorAll(".search").forEach(bindOne);
    highlightFromSession();
  }

  document.addEventListener("nav", boot);
  document.addEventListener("render", boot);
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
`

function classNames(...parts) {
  return parts.filter(Boolean).join(" ")
}

export const PagefindSearch = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  const PagefindSearchComponent = ({ displayClass }) => {
    return h("div", { class: classNames(displayClass, "search") }, [
      h(
        "button",
        {
          class: "search-button",
          "aria-label": "Search",
          "aria-expanded": "false",
          type: "button",
        },
        [
          h("svg", { role: "img", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 19.9 19.7" }, [
            h("title", null, "Search"),
            h("g", { class: "search-path", fill: "none" }, [
              h("path", { "stroke-linecap": "square", d: "M18.5 18.3l-5.4-5.4" }),
              h("circle", { cx: "8", cy: "8", r: "7" }),
            ]),
          ]),
          h("p", null, "Search"),
        ],
      ),
      h("div", { class: "search-container" }, [
        h("div", { class: "search-space" }, [
          h("input", {
            autocomplete: "off",
            class: "search-bar",
            name: "search",
            type: "text",
            "aria-label": "Search for something",
            placeholder: "Search for something",
            "data-result-limit": String(opts.resultLimit),
          }),
          h("div", {
            class: "search-layout",
            "data-preview": String(!!opts.enablePreview),
            role: "listbox",
            "aria-label": "Search results",
          }),
        ]),
      ]),
    ])
  }
  PagefindSearchComponent.afterDOMLoaded = inlineScript
  PagefindSearchComponent.css = css
  PagefindSearchComponent.displayName = "PagefindSearch"
  return PagefindSearchComponent
}

export default PagefindSearch

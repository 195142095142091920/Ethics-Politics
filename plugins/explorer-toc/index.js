/**
 * explorer-toc — Quartz v5 component (plain ESM, no build step).
 * Nests the current page's headings under its left-Explorer entry.
 */
import { h } from "preact"

const css = `
/* Nested page TOC inside the left Explorer, matching Explorer file-tree styles */
.explorer-content ul.explorer-toc {
  list-style: none;
  margin: 0;
  margin-left: 6px;
  padding-left: 0.8rem;
  border-left: 1px solid var(--lightgray);
}

.explorer-content ul.explorer-toc li {
  margin: 0;
}

.explorer-content ul.explorer-toc > li > a,
.explorer-content ul.explorer-toc-sub > li > a {
  color: var(--dark);
  opacity: 0.75;
  display: block;
  font-size: 0.88rem;
  line-height: 1.4;
  padding: 0.15rem 0.1rem;
  text-decoration: none;
}

.explorer-content ul.explorer-toc > li > a:hover,
.explorer-content ul.explorer-toc-sub > li > a:hover {
  color: var(--tertiary);
  opacity: 1;
}

.explorer-content ul.explorer-toc > li > a.is-current,
.explorer-content ul.explorer-toc-sub > li > a.is-current,
.explorer-content ul.explorer-toc > li > a.in-view,
.explorer-content ul.explorer-toc-sub > li > a.in-view {
  opacity: 1;
  color: var(--tertiary);
}

.explorer-content .explorer-toc-h2 {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.explorer-content .explorer-toc-h2 > a {
  flex: 1 1 auto;
  min-width: 0;
}

.explorer-content .explorer-toc-h2 .folder-icon {
  margin-right: 4px;
  margin-top: 0.35rem;
  flex: 0 0 auto;
  cursor: pointer;
  opacity: 0.8;
  transition: transform 0.3s ease;
}

.explorer-content .explorer-toc-h2 .folder-icon.collapsed {
  transform: rotateZ(-90deg);
}

.explorer-content ul.explorer-toc .folder-outer {
  visibility: collapse;
  display: grid;
  grid-template-rows: 0fr;
  transition-property: grid-template-rows, visibility;
  transition-duration: 0.3s;
  transition-timing-function: ease-in-out;
}

.explorer-content ul.explorer-toc .folder-outer.open {
  visibility: visible;
  grid-template-rows: 1fr;
}

.explorer-content ul.explorer-toc-sub {
  list-style: none;
  overflow: hidden;
  margin: 0;
  margin-left: 6px;
  padding-left: 0.8rem;
  border-left: 1px solid var(--lightgray);
}

.explorer-toc-host {
  display: none;
}

/* Collapse the unused right column now that the right-hand TOC is gone */
@media (min-width: 1200px) {
  .page > #quartz-body:has(> .right.sidebar:empty),
  .page > #quartz-body:has(> .sidebar.right:empty) {
    grid-template-columns: 320px auto !important;
    grid-template-areas:
      "grid-sidebar-left grid-header"
      "grid-sidebar-left grid-center"
      "grid-sidebar-left grid-footer" !important;
  }
}
.page > #quartz-body > .right.sidebar:empty,
.page > #quartz-body > .sidebar.right:empty {
  display: none;
}
`

const inlineScript = `
(() => {
  const FOLD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="folder-icon nav-folder-collapse-indicator collapse-icon" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function pageSlug() {
    const raw = (document.body?.dataset?.slug || "").replace(/^\\/+|\\/+$/g, "");
    return raw && raw !== "index" ? raw : "index";
  }

  function pathToSlug(pathname) {
    let p = pathname || "/";
    const base = document.body?.dataset?.basepath || "";
    if (base && p.startsWith(base)) p = p.slice(base.length);
    p = p.replace(/\\/+$/, "").replace(/\\.html$/, "").replace(/^\\/+/, "");
    return p || "index";
  }

  function linkSlug(a) {
    try {
      return pathToSlug(new URL(a.href, location.href).pathname);
    } catch {
      return "";
    }
  }

  function isCurrentPageLink(a) {
    return linkSlug(a) === pageSlug() && !a.closest(".explorer-toc");
  }

  function homeHref() {
    const base = document.body?.dataset?.basepath || "";
    return (base || "") + "/" || "/";
  }

  // Keep a Worldview entry in the Explorer that goes to the home page (/).
  // People may not know to click the site title. The page H1 stays "Ethics and Politics".
  function homeTitle() {
    return "Worldview";
  }

  function headingText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('a[role="anchor"], svg').forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\\s+/g, " ").trim();
  }

  function pageHeadings() {
    const article = document.querySelector("article");
    if (!article) return [];
    // Section pages often use #### (h4) for sub-topics and skip h3.
    return Array.from(article.querySelectorAll("h2[id], h3[id], h4[id]")).map((el) => ({
      id: el.id,
      level: Number(el.tagName.replace("H", "")),
      text: headingText(el),
    })).filter((h) => h.id && h.text);
  }

  function isMobile() {
    return window.matchMedia("(max-width: 800px)").matches;
  }

  function closeMobileExplorer() {
    if (!isMobile()) return;
    document.querySelectorAll(".explorer").forEach((ex) => {
      ex.classList.add("collapsed");
      ex.setAttribute("aria-expanded", "false");
    });
    document.documentElement.classList.remove("mobile-no-scroll");
    document.querySelector("#quartz-body")?.classList.remove("lock-scroll");
  }

  async function ensureHomeItem(ul) {
    const existing = Array.from(ul.querySelectorAll("a.nav-file-title, a.tree-item-self")).find((a) => {
      return !a.closest(".explorer-toc") && linkSlug(a) === "index";
    });
    if (existing) {
      existing.textContent = homeTitle();
      existing.setAttribute("href", homeHref());
      return existing;
    }
    const li = document.createElement("li");
    li.className = "explorer-home";
    const a = document.createElement("a");
    a.href = homeHref();
    a.className = "nav-file-title tree-item-self";
    a.textContent = homeTitle();
    li.appendChild(a);
    const first = ul.querySelector("li:not(.overflow-end)");
    if (first) ul.insertBefore(li, first);
    else ul.appendChild(li);
    return a;
  }

  function makeHeadingLink(item) {
    const a = document.createElement("a");
    a.href = "#" + item.id;
    a.className = "nav-file-title tree-item-self explorer-toc-link";
    a.dataset.for = item.id;
    a.textContent = item.text;
    a.addEventListener("click", () => {
      closeMobileExplorer();
    });
    return a;
  }

  function injectToc(ul) {
    ul.querySelectorAll(".explorer-toc").forEach((el) => el.remove());
    ul.querySelectorAll("li.explorer-has-toc").forEach((li) => li.classList.remove("explorer-has-toc"));

    const heads = pageHeadings();
    const active = Array.from(ul.querySelectorAll("a.nav-file-title, a.tree-item-self")).find(isCurrentPageLink);
    if (!active) return;
    active.classList.add("active", "is-active");
    if (!heads.length) return;

    const tocUl = document.createElement("ul");
    tocUl.className = "explorer-toc";
    tocUl.setAttribute("aria-label", "On this page");

    let currentH2Li = null;
    let currentSub = null;
    let currentOuter = null;

    const startSub = (h2Li) => {
      const outer = document.createElement("div");
      outer.className = "folder-outer";
      const sub = document.createElement("ul");
      sub.className = "explorer-toc-sub";
      outer.appendChild(sub);
      const row = document.createElement("div");
      row.className = "explorer-toc-h2";
      const fold = document.createElement("span");
      fold.innerHTML = FOLD_SVG;
      const svg = fold.firstChild;
      svg.classList.add("collapsed");
      svg.setAttribute("role", "button");
      svg.setAttribute("aria-label", "Show subheadings");
      svg.setAttribute("tabindex", "0");
      const existingLink = h2Li.querySelector(":scope > a");
      row.appendChild(svg);
      if (existingLink) row.appendChild(existingLink);
      h2Li.prepend(row);
      h2Li.appendChild(outer);
      const toggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = outer.classList.toggle("open");
        svg.classList.toggle("collapsed", !open);
        svg.setAttribute("aria-label", open ? "Hide subheadings" : "Show subheadings");
      };
      svg.addEventListener("click", toggle);
      svg.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") toggle(e);
      });
      currentOuter = outer;
      currentSub = sub;
    };

    // Stack of {level, list, li} so h3/h4 nest under the nearest higher heading.
    const stack = [{ level: 1, list: tocUl, li: null }];
    for (const item of heads) {
      while (stack.length > 1 && stack[stack.length - 1].level >= item.level) stack.pop();
      const parent = stack[stack.length - 1];
      let list = parent.list;
      if (parent.li && parent.level < item.level) {
        if (!parent.childList) {
          startSub(parent.li);
          parent.childList = currentSub;
        }
        list = parent.childList;
      }
      const li = document.createElement("li");
      li.appendChild(makeHeadingLink(item));
      list.appendChild(li);
      stack.push({ level: item.level, list, li, childList: null });
    }

    const host = active.closest("li") || active.parentElement;
    if (!host) return;
    host.classList.add("explorer-has-toc");
    host.appendChild(tocUl);

    // Keep the active page + its TOC in view in the explorer
    requestAnimationFrame(() => {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  let headingObserver = null;

  function observeHeadings() {
    if (headingObserver) {
      headingObserver.disconnect();
      headingObserver = null;
    }
    const links = Array.from(document.querySelectorAll(".explorer-toc a[data-for]"));
    if (!links.length) return;
    const byId = new Map(links.map((a) => [a.dataset.for, a]));
    const mark = () => {
      links.forEach((a) => a.classList.remove("is-current"));
      const heads = Array.from(document.querySelectorAll("article h2[id], article h3[id], article h4[id]"));
      if (!heads.length) return;
      const pad = 96;
      let current = heads[0];
      for (const el of heads) {
        if (el.getBoundingClientRect().top <= pad) current = el;
      }
      const a = byId.get(current.id);
      if (a) a.classList.add("is-current");
    };
    headingObserver = new IntersectionObserver(mark, { rootMargin: "-80px 0px -60% 0px", threshold: [0, 1] });
    document.querySelectorAll("article h2[id], article h3[id], article h4[id]").forEach((el) => headingObserver.observe(el));
    mark();
    window.addEventListener("scroll", mark, { passive: true });
    if (window.addCleanup) {
      window.addCleanup(() => {
        window.removeEventListener("scroll", mark);
        if (headingObserver) headingObserver.disconnect();
      });
    }
  }

  function explorerReady(ul) {
    return Boolean(ul.querySelector("a.nav-file-title, a.tree-item-self"));
  }

  function waitForExplorer(ul, timeoutMs) {
    if (explorerReady(ul)) return Promise.resolve();
    return new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        if (explorerReady(ul)) {
          mo.disconnect();
          clearTimeout(tid);
          resolve();
        }
      });
      mo.observe(ul, { childList: true, subtree: true });
      const tid = setTimeout(() => {
        mo.disconnect();
        resolve();
      }, timeoutMs);
    });
  }

  let runId = 0;
  async function run() {
    const id = ++runId;
    const lists = Array.from(document.querySelectorAll(".explorer-ul"));
    await Promise.all(lists.map((ul) => waitForExplorer(ul, 2500)));
    if (id !== runId) return;
    for (const ul of lists) {
      await ensureHomeItem(ul);
      injectToc(ul);
    }
    observeHeadings();
  }

  document.addEventListener("nav", run);
  document.addEventListener("render", run);
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
})();
`

function classNames(...parts) {
  return parts.filter(Boolean).join(" ")
}

export const ExplorerToc = (userOpts) => {
  const ExplorerTocComponent = ({ displayClass }) => {
    return h("span", { class: classNames(displayClass, "explorer-toc-host"), hidden: true, "aria-hidden": "true" })
  }
  ExplorerTocComponent.afterDOMLoaded = inlineScript
  ExplorerTocComponent.css = css
  ExplorerTocComponent.displayName = "ExplorerToc"
  return ExplorerTocComponent
}

export default ExplorerToc

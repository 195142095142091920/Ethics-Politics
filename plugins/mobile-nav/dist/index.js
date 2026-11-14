/**
 * mobile-nav — Quartz v5 component (plain ESM, no build step).
 * Mobile-only Sections button + bottom-sheet TOC. Desktop unchanged.
 */
import { h } from "preact"

const css = `
@media (max-width: 800px) {
  .page > #quartz-body > .left.sidebar,
  .page > #quartz-body .sidebar.left:has(.explorer) {
    position: sticky;
    top: 0;
    z-index: 200;
    isolation: isolate;
    box-sizing: border-box;
    width: 100%;
    min-height: 3.25rem;
    margin: 0;
    padding: 0.35rem 0;
    background: var(--light) !important;
    background-color: var(--light, #faf8f8) !important;
    border-bottom: 1px solid color-mix(in srgb, var(--gray) 35%, transparent);
  }

  html.mobile-toc-open .page > #quartz-body > .left.sidebar,
  html.mobile-toc-open .page > #quartz-body .sidebar.left:has(.explorer) {
    z-index: 0;
  }

  .page > #quartz-body > .left.sidebar .page-title {
    display: none;
  }

  .page > #quartz-body > .left.sidebar .search > .search-button {
    width: auto;
    min-width: 44px;
    min-height: 44px;
    height: 44px;
    padding: 0 0.65rem;
    justify-content: center;
    box-sizing: border-box;
  }

  .mobile-toc {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  button.mobile-toc-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0 0.65rem;
    border: 1px solid var(--lightgray);
    border-radius: 4px;
    background: transparent;
    color: var(--dark);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
  }

  button.mobile-toc-button[hidden] {
    display: none;
  }

  button.mobile-toc-button svg {
    width: 18px;
    height: 18px;
    stroke: var(--darkgray);
    fill: none;
    flex-shrink: 0;
  }

  button.mobile-toc-button[aria-expanded="true"] {
    border-color: var(--secondary);
    color: var(--secondary);
  }

  /* Hide the end-of-article TOC; the sheet reuses the same node when open. */
  .page > #quartz-body > .right.sidebar > .toc {
    display: none !important;
  }

  html.mobile-toc-open {
    overflow: hidden;
  }

  html.mobile-toc-open .mobile-toc-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.35);
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  html.mobile-toc-open .page > #quartz-body > .right.sidebar > .toc {
    display: flex !important;
    flex-direction: column;
    position: fixed;
    z-index: 10001;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: min(85dvh, 42rem);
    margin: 0;
    padding: 0.65rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    background: var(--light);
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--gray) 40%, transparent);
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -10px 32px rgba(27, 33, 48, 0.18);
    overflow: hidden;
  }

  html.mobile-toc-open .toc .toc-header {
    pointer-events: none;
    cursor: default;
    padding: 0.25rem 2.5rem 0.5rem 0;
  }

  html.mobile-toc-open .toc .toc-header h3 {
    font-size: 1.05rem;
    font-weight: 700;
  }

  html.mobile-toc-open .toc .toc-header .fold,
  html.mobile-toc-open .toc .toc-header svg.fold {
    display: none !important;
  }

  html.mobile-toc-open .toc .toc-content,
  html.mobile-toc-open .toc .toc-content.collapsed,
  html.mobile-toc-open .toc .toc-content.overflow,
  html.mobile-toc-open .toc ul.toc-content {
    display: block !important;
    height: auto !important;
    max-height: calc(min(85dvh, 42rem) - 3.5rem) !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    overscroll-behavior: contain;
    margin: 0;
    padding: 0 0 0.5rem;
    -webkit-overflow-scrolling: touch;
  }

  html.mobile-toc-open .toc .toc-content > li > a {
    display: block;
    padding: 0.55rem 0.4rem;
    font-size: 1rem;
    line-height: 1.35;
    opacity: 0.55;
    color: var(--dark);
    border-radius: 4px;
  }

  html.mobile-toc-open .toc .toc-content > li > a.in-view {
    opacity: 0.9;
  }

  html.mobile-toc-open .toc .toc-content > li > a.is-current {
    opacity: 1;
    color: var(--secondary);
    font-weight: 700;
    background: var(--highlight);
    box-shadow: inset 3px 0 0 var(--secondary);
  }

  html.mobile-toc-open .toc .toc-content .depth-1 > a {
    padding-left: 1.25rem;
    font-size: 0.95rem;
  }

  html.mobile-toc-open .toc .toc-close {
    display: flex;
    position: absolute;
    top: 0.45rem;
    right: 0.6rem;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--darkgray);
    font-size: 1.6rem;
    line-height: 1;
    cursor: pointer;
  }
}

@media (min-width: 801px) {
  .mobile-toc {
    display: none;
  }
}

.mobile-toc-backdrop {
  display: none;
}

.toc .toc-close {
  display: none;
}
`

const inlineScript = `
(() => {
  const MQ = window.matchMedia("(max-width: 800px)");
  const cleanups = [];

  function tocEl() {
    return document.querySelector(".page > #quartz-body > .right.sidebar > .toc")
      || document.querySelector(".sidebar.right > .toc")
      || document.querySelector(".toc");
  }

  function buttonEl() {
    return document.querySelector("button.mobile-toc-button");
  }

  function ensureBackdrop() {
    let el = document.querySelector(".mobile-toc-backdrop");
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "mobile-toc-backdrop";
      el.setAttribute("aria-label", "Close sections");
      document.body.appendChild(el);
    }
    return el;
  }

  function ensureClose(toc) {
    if (!toc) return null;
    let btn = toc.querySelector(".toc-close");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toc-close";
      btn.setAttribute("aria-label", "Close sections");
      btn.textContent = "×";
      toc.style.position = toc.style.position;
      toc.appendChild(btn);
    }
    return btn;
  }

  function currentSlug() {
    const heads = Array.from(document.querySelectorAll("article h1[id], article h2[id], article h3[id], article h4[id], article h5[id], article h6[id]"));
    if (!heads.length) return null;
    const pad = 88;
    let current = heads[0];
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= pad) current = h;
    }
    return current.id || null;
  }

  function markCurrent() {
    document.querySelectorAll(".toc-content a.is-current").forEach((a) => a.classList.remove("is-current"));
    const id = currentSlug();
    if (!id) return null;
    const a = document.querySelector('.toc-content a[data-for="' + CSS.escape(id) + '"]');
    if (a) a.classList.add("is-current");
    return a;
  }

  function isOpen() {
    return document.documentElement.classList.contains("mobile-toc-open");
  }

  function open() {
    if (!MQ.matches) return;
    const toc = tocEl();
    const btn = buttonEl();
    if (!toc || !btn || btn.hidden) return;
    ensureBackdrop();
    ensureClose(toc);
    const header = toc.querySelector("button.toc-header");
    if (header && header.classList.contains("collapsed")) header.click();
    document.documentElement.classList.add("mobile-toc-open", "mobile-no-scroll");
    btn.setAttribute("aria-expanded", "true");
    const cur = markCurrent();
    requestAnimationFrame(() => {
      cur?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }

  function close() {
    const toc = tocEl();
    const btn = buttonEl();
    document.documentElement.classList.remove("mobile-toc-open", "mobile-no-scroll");
    if (btn) btn.setAttribute("aria-expanded", "false");
    const header = toc?.querySelector("button.toc-header");
    if (header && !header.classList.contains("collapsed") && MQ.matches) {
      header.click();
    }
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function syncButton() {
    const btn = buttonEl();
    const toc = tocEl();
    if (btn) btn.hidden = !toc;
  }

  function boot() {
    while (cleanups.length) {
      try { cleanups.pop()(); } catch { /* ignore */ }
    }
    syncButton();
    const btn = buttonEl();
    const toc = tocEl();
    const backdrop = ensureBackdrop();
    if (toc) ensureClose(toc);

    if (btn) {
      const onBtn = (e) => { e.preventDefault(); e.stopPropagation(); toggle(); };
      btn.addEventListener("click", onBtn);
      cleanups.push(() => btn.removeEventListener("click", onBtn));
    }

    const onBackdrop = () => close();
    backdrop.addEventListener("click", onBackdrop);
    cleanups.push(() => backdrop.removeEventListener("click", onBackdrop));

    const closeBtn = toc?.querySelector(".toc-close");
    if (closeBtn) {
      const onClose = (e) => { e.preventDefault(); e.stopPropagation(); close(); };
      closeBtn.addEventListener("click", onClose);
      cleanups.push(() => closeBtn.removeEventListener("click", onClose));
    }

    const onLink = (e) => {
      const a = e.target.closest?.(".toc-content a");
      if (!a || !isOpen()) return;
      close();
    };
    if (toc) {
      toc.addEventListener("click", onLink);
      cleanups.push(() => toc.removeEventListener("click", onLink));
    }

    const onKey = (e) => {
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", onKey);
    cleanups.push(() => document.removeEventListener("keydown", onKey));

    const onMq = () => { if (!MQ.matches && isOpen()) close(); syncButton(); };
    if (MQ.addEventListener) MQ.addEventListener("change", onMq);
    else MQ.addListener(onMq);
    cleanups.push(() => {
      if (MQ.removeEventListener) MQ.removeEventListener("change", onMq);
      else MQ.removeListener(onMq);
    });

    if (!toc) close();
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

export const MobileNav = (userOpts) => {
  const MobileNavComponent = ({ displayClass }) => {
    return h("div", { class: classNames(displayClass, "mobile-toc") }, [
      h(
        "button",
        {
          type: "button",
          class: "mobile-toc-button",
          "aria-label": "Sections",
          "aria-expanded": "false",
        },
        [
          h(
            "svg",
            {
              xmlns: "http://www.w3.org/2000/svg",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "aria-hidden": "true",
            },
            [
              h("line", { x1: "8", y1: "6", x2: "21", y2: "6" }),
              h("line", { x1: "8", y1: "12", x2: "21", y2: "12" }),
              h("line", { x1: "8", y1: "18", x2: "21", y2: "18" }),
              h("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }),
              h("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }),
              h("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" }),
            ],
          ),
          h("span", null, "Sections"),
        ],
      ),
    ])
  }
  MobileNavComponent.afterDOMLoaded = inlineScript
  MobileNavComponent.css = css
  MobileNavComponent.displayName = "MobileNav"
  return MobileNavComponent
}

export default MobileNav

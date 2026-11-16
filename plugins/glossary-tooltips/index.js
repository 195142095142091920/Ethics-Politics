/**
 * glossary-tooltips - Quartz v5 transformer (plain ESM, no build step).
 *
 * At build time, wraps every eligible use of each glossary term in an accessible
 * hover/focus/tap tooltip. Page wording is not changed: the matched words stay as
 * they are, only markup is added around them. Definitions are stored once per page
 * (a hidden data attribute) and copied into a tooltip when it is first shown, so
 * the definition text never enters headings, search, or the topic index.
 *
 * Sources of truth:
 *   - terms.json (this folder): which terms, and the exact phrases that may match.
 *   - content/Glossary Index.md: the definition for every term.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()

// ---------- definitions ----------
function mdToText(s) {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, a) => a.split("#").pop())
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, "$1$2")
    .replace(/\\\$/g, "$")
    .replace(/\s+/g, " ")
    .trim()
}



function readIndex(contentDir) {
  const out = new Map()
  const file = path.join(contentDir, "Glossary Index.md")
  if (!fs.existsSync(file)) return out
  const re = /^(?:- )?\*\*(.+?)\*\* - (.*?)(?: \*?\(((?:[^()]|\([^()]*\))*)\)\*?)? \^(g-[\w-]+)\s*$/
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(re)
    if (m) out.set(m[4], { term: m[1], def: mdToText(m[2]), src: m[3] ?? "" })
  }
  return out
}

function loadTerms(contentDir) {
  const spec = JSON.parse(fs.readFileSync(path.join(HERE, "terms.json"), "utf8"))
  const index = readIndex(contentDir)
  const terms = []
  for (const t of spec.terms) {
    const e = index.get(t.id)
    const def = e ? e.def : undefined
    const src = e ? e.src : undefined
    const href = "glossary-index#" + t.id
    if (!def) continue // no definition on the site yet: no tooltip
    const regexes = t.patterns.map((pat) => {
      const o = typeof pat === "string" ? { re: pat } : pat
      const p = o.re
      const ci = p.startsWith("i:")
      const body = ci ? p.slice(2) : p
      const re = new RegExp(
        "(?<![\\p{L}\\p{N}_-])(?:" + body + ")(?![\\p{L}\\p{N}_-])",
        ci ? "giu" : "gu",
      )
      re.pages = o.pages ?? null
      re.sections = o.sections ? o.sections.map((x) => x.toLowerCase()) : null
      re.notSections = (o.notSections ?? []).map((x) => x.toLowerCase())
      return re
    })
    terms.push({
      ...t,
      def,
      src,
      href,
      regexes,
      skipSections: (t.skipSections ?? []).map((s) => s.toLowerCase()),
      skipPages: t.skipPages ?? [],
    })
  }
  return { terms, headings: new Set(spec.sectionHeadings ?? ["h2", "h3"]) }
}

// ---------- tree helpers ----------
const SKIP_TAGS = new Set([
  "a",
  "code",
  "pre",
  "kbd",
  "samp",
  "script",
  "style",
  "svg",
  "math",
  "button",
  "textarea",
  "select",
  "label",
])
const BLOCK_TAGS = new Set([
  "p",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div",
  "blockquote",
])

function classes(node) {
  const c = node.properties?.className
  return Array.isArray(c) ? c.map(String) : c ? String(c).split(/\s+/) : []
}
function textOf(node) {
  if (node.type === "text") return node.value
  return (node.children ?? []).map(textOf).join("")
}
function wordCount(s) {
  return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length
}

function isSkippedElement(node) {
  if (node.type !== "element") return false
  if (SKIP_TAGS.has(node.tagName)) return true
  const cls = classes(node)
  if (
    cls.includes("gt") ||
    cls.includes("gt-defs") ||
    cls.includes("katex") ||
    cls.includes("back-to-top")
  )
    return true
  return false
}

// Ranges never wrapped: Obsidian syntax that failed to render and shows as raw
// text ([[...]] or [!callout]); wrapping it would hide the bug, not fix it.
function excludedRanges(s) {
  const ranges = []
  for (const re of [/\[\[[^\]]*(?:\]\])?/g, /\[![\w-]+\][+-]?[^\n]*/g]) {
    let m
    while ((m = re.exec(s))) ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}

function buildTooltip(t, text, tipId) {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["gt"] },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: {
          role: "button",
          tabIndex: 0,
          className: ["gt-term"],
          ariaDescribedBy: tipId,
          ariaExpanded: "false",
          dataG: t.id,
        },
        children: [{ type: "text", value: text }],
      },
      {
        type: "element",
        tagName: "span",
        properties: {
          className: ["gt-tip"],
          id: tipId,
          role: "tooltip",
          dataPagefindIgnore: "all",
        },
        children: [],
      },
    ],
  }
}

function pageKey(file) {
  const slug = String(file.data?.slug ?? "")
  return slug
}

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ---------- transformer ----------
function selfWrap(tree, slug, terms, prefix, counter, used) {
  // On the glossary page, each entry's own label is wrapped with its own definition.
  const byId = new Map()
  for (const t of terms) byId.set(t.id, t)
  const wrapAll = (el, t) => {
    const kids = el.children ?? []
    const i = kids.findIndex((c) => c.type === "text" && c.value.trim())
    if (i < 0 || !t) return
    // only when the heading/label is a single text node (plus an optional anchor link)
    const txt = kids
      .filter((c) => c.type === "text")
      .map((c) => c.value)
      .join("")
    if (kids.filter((c) => c.type === "text" && c.value.trim()).length !== 1) return
    kids.splice(i, 1, buildTooltip(t, kids[i].value, prefix + ++counter.n))
    used.add(t.id)
    counter.stats.push({ id: t.id, term: t.term, text: txt.trim(), section: "(own entry)" })
  }
  ;(function walk(node) {
    if (node.type !== "element" && node.type !== "root") return
    if (slug === "glossary-index" && node.tagName === "p") {
      const id = String(node.properties?.id ?? "")
      const first = (node.children ?? []).find((c) => !(c.type === "text" && !c.value.trim()))
      if (id.startsWith("g-") && first?.type === "element" && first.tagName === "strong")
        wrapAll(first, byId.get(id))
      return
    }
    for (const c of node.children ?? []) walk(c)
  })(tree)
}

function transform(tree, file, ctxTerms) {
  const { terms, headings } = ctxTerms
  const fm = file.data?.frontmatter ?? {}
  if (fm.glossaryTooltips === false || fm.glossaryTooltips === "false") return
  const slug = pageKey(file).toLowerCase()
  const pageTerms = terms.filter((t) => !t.skipPages.includes(slug))
  const prefix = "gt-" + hash(slug) + "-"
  const stats = (file.data.glossaryTooltips = [])
  const counter = { n: 0, stats }
  const used = new Set() // term ids present on this page (for the definitions payload)
  let section = ""

  selfWrap(tree, slug, terms, prefix, counter, used)

  // Group eligible text nodes by their nearest block ancestor, in document order.
  // A heading is itself a block (its text is matched too) and starts a new section.
  const blocks = []
  function walk(node, parent, block, skipped) {
    if (node.type === "element") {
      // No tooltips inside headings (the glossary pages' own entry labels are wrapped by selfWrap).
      const nowSkipped = skipped || isSkippedElement(node) || /^h[1-6]$/.test(node.tagName)
      if (headings.has(node.tagName)) blocks.push({ heading: textOf(node).trim() })
      const nb = BLOCK_TAGS.has(node.tagName) ? { nodes: [] } : block
      if (nb !== block) blocks.push(nb)
      for (const c of [...(node.children ?? [])]) walk(c, node, nb, nowSkipped)
      return
    }
    if (node.type === "root") {
      const nb = { nodes: [] }
      blocks.push(nb)
      for (const c of [...node.children]) walk(c, node, nb, false)
      return
    }
    if (node.type === "text" && block) block.nodes.push({ node, parent, skipped })
  }
  walk(tree, null, null, false)

  for (const b of blocks) {
    if (b.heading !== undefined) {
      section = b.heading.toLowerCase()
      continue
    }
    if (!b.nodes.length || !b.nodes.some((x) => !x.skipped)) continue
    let s = ""
    const spans = []
    for (const x of b.nodes) {
      spans.push({ ...x, start: s.length, end: s.length + x.node.value.length })
      s += x.node.value
    }
    const raw = excludedRanges(s)
    const cands = []
    for (const t of pageTerms) {
      if (t.skipSections.some((h) => section === h)) continue
      for (const re of t.regexes) {
        if (re.pages && !re.pages.includes(slug)) continue
        if (re.sections && !re.sections.includes(section)) continue
        if (re.notSections.includes(section)) continue
        re.lastIndex = 0
        let m
        while ((m = re.exec(s))) {
          if (m[0].length === 0) {
            re.lastIndex++
            continue
          }
          cands.push({ t, start: m.index, end: m.index + m[0].length })
        }
      }
    }
    if (!cands.length) continue
    // longest match wins; ties go to the earlier term in terms.json
    const byLen = cands
      .map((c, i) => ({ ...c, i }))
      .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || a.i - b.i)
    const taken = []
    for (const c of byLen) {
      if (taken.some((k) => c.start < k.end && k.start < c.end)) continue
      taken.push(c)
    }
    const chosen = []
    for (const c of taken.sort((a, b) => a.start - b.start)) {
      if (raw.some(([qs, qe]) => c.start < qe && qs < c.end)) continue
      const sp = spans.find((x) => c.start >= x.start && c.end <= x.end)
      if (!sp || sp.skipped) continue
      chosen.push({ ...c, sp })
    }
    const byNode = new Map()
    for (const c of chosen) {
      if (!byNode.has(c.sp.node)) byNode.set(c.sp.node, [])
      byNode.get(c.sp.node).push(c)
    }
    for (const [node, list] of byNode) {
      const sp = list[0].sp
      const parent = sp.parent
      const idx = parent.children.indexOf(node)
      if (idx < 0) continue
      const value = node.value
      const out = []
      let pos = 0
      for (const c of list.sort((a, b) => a.start - b.start)) {
        const ls = c.start - sp.start
        const le = c.end - sp.start
        if (ls > pos) out.push({ type: "text", value: value.slice(pos, ls) })
        const text = value.slice(ls, le)
        out.push(buildTooltip(c.t, text, prefix + ++counter.n))
        used.add(c.t.id)
        stats.push({ id: c.t.id, term: c.t.term, text, section })
        pos = le
      }
      if (pos < value.length) out.push({ type: "text", value: value.slice(pos) })
      parent.children.splice(idx, 1, ...out)
    }
  }

  // Definitions used on this page, stored once. Links are relative to the page;
  // terms in content transcluded from another page fall back to the index page's list.
  const defs = {}
  for (const t of terms) if (used.has(t.id)) defs[t.id] = [t.term, t.def, t.src ?? "", t.href]
  const depth = slug.split("/").length - 1
  tree.children.push({
    type: "element",
    tagName: "span",
    properties: {
      className: ["gt-defs"],
      hidden: true,
      dataPagefindIgnore: "all",
      dataGtBase: depth ? "../".repeat(depth) : "./",
      dataGt: JSON.stringify(defs),
    },
    children: [],
  })
}

// ---------- client ----------
const css = `
.gt{position:relative;display:inline}
.gt-term{cursor:help;display:inline;white-space:normal;
 text-decoration:underline dotted var(--secondary);text-underline-offset:.18em;text-decoration-thickness:1.5px}
.gt-term:focus-visible{outline:2px solid var(--secondary);outline-offset:2px;border-radius:2px}
.gt-tip{display:none;position:fixed;left:0;top:0;z-index:999;width:min(22rem,calc(100vw - 16px));max-height:min(60vh,26rem);overflow:auto;
 background:var(--dark);color:var(--light);padding:.6rem .75rem;border-radius:8px;font-size:.86rem;line-height:1.45;
 border:0 solid transparent;border-top-width:6px;background-clip:padding-box;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25));
 font-weight:normal;font-style:normal;font-family:var(--bodyFont);text-align:left;white-space:normal;text-indent:0;text-transform:none;letter-spacing:normal}
.gt.gt-above>.gt-tip{border-top-width:0;border-bottom-width:6px}
.gt-tip strong{display:block;margin-bottom:.2rem;color:inherit}
.gt-tip .gt-link{color:inherit;text-decoration:underline;font-weight:600;background:none}
.gt-tip .gt-src{opacity:.8;font-size:.8rem}
:root[saved-theme="dark"] .gt-tip{background:var(--light);color:var(--darkgray);box-shadow:inset 0 0 0 1px var(--lightgray)}
:root[saved-theme="dark"] .gt-tip strong{color:var(--dark)}
.gt:hover>.gt-tip,.gt:focus-within>.gt-tip,.gt.open>.gt-tip{display:block}
.gt>.gt-tip:empty,.gt.gt-dismissed>.gt-tip{display:none!important}
.popover .gt-tip{display:none!important}
.popover .gt-term{cursor:inherit}
@media (max-width:640px){.gt-tip,.gt.gt-above>.gt-tip{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto;max-height:45vh;border-width:0}}
@media (hover:none){.gt:hover>.gt-tip{display:none}.gt.open>.gt-tip,.gt:focus-within>.gt-tip{display:block}}
@media print{.gt-tip{display:none!important}.gt-term{text-decoration:none}}
`

const script = `
(function(){
  if (window.__gtInit) return; window.__gtInit = true;
  var open = null, hov = null, defs = null, base = './', extra = {}, loading = null;
  function merge(el, into){ try { var d = JSON.parse(el.getAttribute('data-gt')); for (var k in d) if (!into[k]) into[k] = d[k]; } catch(e) {} }
  function getDefs(){
    if (defs) return defs;
    defs = {};
    var own = null;
    document.querySelectorAll('.gt-defs[data-gt]').forEach(function(el){
      if (!own && !el.closest('.popover')) own = el;
      merge(el, defs);
    });
    base = (own && own.getAttribute('data-gt-base')) || './';
    for (var k in extra) if (!defs[k]) defs[k] = extra[k];
    return defs;
  }
  // A term inside content transcluded from another page may have no definition on
  // this page: load the Glossary Index page's list once, then fill.
  function loadIndex(then){
    if (!loading) loading = fetch(base + 'glossary-index').then(function(r){ return r.text(); }).then(function(html){
      var doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('.gt-defs[data-gt]').forEach(function(el){ merge(el, extra); });
      for (var k in extra) if (defs && !defs[k]) defs[k] = extra[k];
    }).catch(function(){});
    loading.then(then);
  }
  function tipOf(g){ return g && g.querySelector(':scope > .gt-tip'); }
  function btnOf(g){ return g && g.querySelector(':scope > .gt-term'); }
  function fill(g){
    var t = tipOf(g), b = btnOf(g); if (!t || !b || t.firstChild) return;
    var d = getDefs()[b.getAttribute('data-g')];
    if (!d) { loadIndex(function(){ if (getDefs()[b.getAttribute('data-g')]) { fill(g); place(g); } }); return; }
    var s = document.createElement('strong'); s.textContent = d[0]; t.appendChild(s);
    t.appendChild(document.createTextNode(' ' + d[1] + ' '));
    if (d[2]) { var c = document.createElement('span'); c.className = 'gt-src'; c.textContent = '(' + d[2] + ')'; t.appendChild(c); t.appendChild(document.createTextNode(' ')); }
    var a = document.createElement('a'); a.className = 'gt-link'; a.href = base + d[3]; a.setAttribute('data-no-popover', 'true'); a.textContent = 'Glossary entry'; t.appendChild(a);
  }
  function place(g){
    var t = tipOf(g), b = btnOf(g); if (!t || !b) return;
    if (window.matchMedia('(max-width:640px)').matches) return;
    var r = b.getClientRects(); r = r.length ? r[0] : b.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = t.offsetWidth || Math.min(352, vw - 16), h = t.offsetHeight || 160;
    var left = Math.max(8, Math.min(r.left, vw - w - 8));
    var top = r.bottom, above = false;
    if (top + h > vh - 8 && r.top - h > 8) { top = r.top - h; above = true; }
    t.style.left = left + 'px'; t.style.top = top + 'px';
    g.classList.toggle('gt-above', above);
  }
  function close(g){ if(!g) return; g.classList.remove('open'); var b=btnOf(g); if(b) b.setAttribute('aria-expanded','false'); if(open===g) open=null; }
  // Capture phase, so a term inside a collapsible callout title or a <summary>
  // opens its definition without also toggling the callout/table.
  document.addEventListener('click', function(ev){
    var tg = ev.target, inGt = tg.closest && tg.closest('.gt');
    var b = tg.closest && tg.closest('.gt-term');
    if (inGt && inGt.closest('.callout-title, summary')) {
      ev.stopPropagation();
      if (b) ev.preventDefault();
    }
    if (b) {
      var g = b.parentNode, was = g.classList.contains('open');
      fill(g);
      if (open && open !== g) close(open);
      g.classList.remove('gt-dismissed');
      if (was) close(g); else { g.classList.add('open'); b.setAttribute('aria-expanded','true'); open = g; requestAnimationFrame(function(){ place(g); }); }
      return;
    }
    if (open && !(tg.closest && tg.closest('.gt-tip'))) close(open);
  }, true);
  document.addEventListener('keydown', function(ev){
    var ae = document.activeElement;
    if ((ev.key === 'Enter' || ev.key === ' ') && ae && ae.classList && ae.classList.contains('gt-term')) {
      ev.preventDefault(); ae.click(); return;
    }
    if (ev.key !== 'Escape') return;
    var a = document.activeElement, g = (a && a.closest && a.closest('.gt')) || open || hov;
    if (!g) return;
    var wasOpen = (g === open);
    close(g); g.classList.add('gt-dismissed');
    var b = btnOf(g); if (b && g.contains(a)) b.focus();
    if (wasOpen || g.contains(a)) ev.stopPropagation();
  }, true);
  document.addEventListener('focusin', function(ev){
    var g = ev.target.closest && ev.target.closest('.gt');
    if (open && open !== g) close(open);
    if (g) { fill(g); requestAnimationFrame(function(){ place(g); }); }
  }, true);
  document.addEventListener('focusout', function(ev){
    var g = ev.target.closest && ev.target.closest('.gt');
    if (g && !g.contains(ev.relatedTarget)) g.classList.remove('gt-dismissed');
  });
  document.addEventListener('mouseover', function(ev){
    var g = ev.target.closest && ev.target.closest('.gt');
    if (g === hov) return;
    if (hov) hov.classList.remove('gt-dismissed');
    hov = g;
    if (g) { fill(g); place(g); requestAnimationFrame(function(){ place(g); }); }
  });
  window.addEventListener('scroll', function(){ if (open) place(open); if (hov) place(hov); }, {passive:true, capture:true});
  window.addEventListener('resize', function(){ if (open) place(open); });
  document.addEventListener('nav', function(){ open = null; hov = null; defs = null; });
})();
`

const GlossaryTooltips = (userOpts) => {
  let loaded = null
  return {
    name: "GlossaryTooltips",
    htmlPlugins(ctx) {
      const contentDir = path.resolve(ctx?.argv?.directory ?? path.join(ROOT, "content"))
      return [
        () => (tree, file) => {
          if (!loaded) loaded = loadTerms(contentDir)
          transform(tree, file, loaded)
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: css, inline: true }],
        js: [{ script, loadTime: "afterDOMReady", contentType: "inline" }],
      }
    },
  }
}

export { GlossaryTooltips }
export default GlossaryTooltips

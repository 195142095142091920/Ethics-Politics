/**
 * glossary-tooltips - Quartz v5 transformer (plain ESM, no build step).
 *
 * At build time, wraps the first eligible use of each glossary term per h2/h3
 * section in an accessible hover/focus/tap tooltip. Page wording is not changed:
 * the matched words stay as they are, only markup is added around them.
 *
 * Sources of truth:
 *   - terms.json (this folder): which terms, and the exact phrases that may match.
 *   - content/Glossary.md: definitions for terms that have a site Glossary entry.
 *   - content/Glossary Index.md: definitions for every other term.
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

function headingSlug(h) {
  // github-slugger compatible for the headings used here
  return h
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- ]/gu, "")
    .replace(/ /g, "-")
}

function readGlossary(contentDir) {
  const out = new Map()
  const file = path.join(contentDir, "Glossary.md")
  if (!fs.existsSync(file)) return out
  const src = fs.readFileSync(file, "utf8")
  const parts = src.split(/^## /m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf("\n")
    const heading = part.slice(0, nl).trim()
    let body = part.slice(nl + 1)
    body = body.split(/^---\s*$/m)[0]
    body = body.split(/^Set out in /m)[0]
    out.set(heading, mdToText(body))
  }
  return out
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
  const glossary = readGlossary(contentDir)
  const index = readIndex(contentDir)
  const terms = []
  for (const t of spec.terms) {
    let def, src, href
    if (t.glossaryHeading) {
      def = glossary.get(t.glossaryHeading)
      src = "site Glossary"
      href = "./glossary#" + headingSlug(t.glossaryHeading)
    } else {
      const e = index.get(t.id)
      if (e) {
        def = e.def
        src = e.src
      }
      href = "./glossary-index#" + t.id
    }
    if (!def) continue // no definition on the site yet: no tooltip
    const regexes = t.patterns.map((p) => {
      const ci = p.startsWith("i:")
      const body = ci ? p.slice(2) : p
      return new RegExp(
        "(?<![\\p{L}\\p{N}_-])(?:" + body + ")(?![\\p{L}\\p{N}_-])",
        ci ? "giu" : "gu",
      )
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
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "summary",
  "th",
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
    cls.includes("katex") ||
    cls.includes("callout-title") ||
    cls.includes("back-to-top")
  )
    return true
  if (node.tagName === "blockquote") {
    const isCallout = cls.includes("callout")
    const kind = String(node.properties?.dataCallout ?? "")
    if (isCallout && kind === "quote") return true // "Sources" callouts
    if (!isCallout && wordCount(textOf(node)) > 5) return true // real quotations
  }
  if (node.tagName === "q" && wordCount(textOf(node)) > 5) return true
  return false
}

// Ranges never wrapped: quoted spans ("..." or “...”) longer than five words, and
// Obsidian syntax that failed to render and shows as raw text ([[...]] or [!callout]).
function excludedRanges(s) {
  const ranges = []
  for (const re of [/\[\[[^\]]*(?:\]\])?/g, /\[![\w-]+\][+-]?[^\n]*/g]) {
    let m
    while ((m = re.exec(s))) ranges.push([m.index, m.index + m[0].length])
  }
  for (const re of [/“[^”]*”/g, /"[^"\n]*"/g]) {
    let m
    while ((m = re.exec(s))) if (wordCount(m[0]) > 5) ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}

function buildTooltip(t, text, tipId) {
  const tipChildren = [
    {
      type: "element",
      tagName: "strong",
      properties: {},
      children: [{ type: "text", value: t.term }],
    },
    { type: "text", value: " " + t.def + " " },
  ]
  if (t.src) {
    tipChildren.push({
      type: "element",
      tagName: "span",
      properties: { className: ["gt-src"] },
      children: [{ type: "text", value: "(" + t.src + ")" }],
    })
    tipChildren.push({ type: "text", value: " " })
  }
  tipChildren.push({
    type: "element",
    tagName: "a",
    properties: { className: ["gt-link"], href: t.href, dataNoPopover: "true" },
    children: [{ type: "text", value: "Glossary entry" }],
  })
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["gt"] },
    children: [
      {
        type: "element",
        tagName: "button",
        properties: {
          type: "button",
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
        children: tipChildren,
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
function transform(tree, file, ctxTerms) {
  const { terms, headings } = ctxTerms
  const fm = file.data?.frontmatter ?? {}
  if (fm.glossaryTooltips === false || fm.glossaryTooltips === "false") return
  const slug = pageKey(file).toLowerCase()
  const pageTerms = terms.filter((t) => !t.skipPages.includes(slug))
  const prefix = "gt-" + hash(slug) + "-"
  let n = 0
  let section = ""
  let used = new Set()
  const stats = (file.data.glossaryTooltips = [])

  // Group eligible text nodes by their nearest block ancestor, in document order.
  // Sections reset at h2/h3. Processing happens block by block.
  const blocks = [] // {nodes: [{node,parent}], section}
  const blockOf = new Map()

  function walk(node, parent, block, skipped) {
    if (node.type === "element") {
      if (headings.has(node.tagName)) {
        blocks.push({ heading: textOf(node).trim() })
        return
      }
      const nowSkipped = skipped || isSkippedElement(node)
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
      used = new Set()
      continue
    }
    if (!b.nodes.length || !b.nodes.some((x) => !x.skipped)) continue
    // concatenated block text with offsets
    let s = ""
    const spans = []
    for (const x of b.nodes) {
      spans.push({ ...x, start: s.length, end: s.length + x.node.value.length })
      s += x.node.value
    }
    const quotes = excludedRanges(s)
    const cands = []
    for (const t of pageTerms) {
      if (t.skipSections.some((h) => section === h)) continue
      // on the Glossary page, a term is not wrapped inside its own entry
      if (slug === "glossary" && t.glossaryHeading && section === t.glossaryHeading.toLowerCase())
        continue
      for (const re of t.regexes) {
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
    cands.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
    // longest-first, non-overlapping (used terms still block shorter overlaps)
    const chosen = []
    let lastEnd = -1
    const byLen = [...cands].sort(
      (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
    )
    const taken = []
    for (const c of byLen) {
      if (taken.some((k) => c.start < k.end && k.start < c.end)) continue
      taken.push(c)
    }
    taken.sort((a, b) => a.start - b.start)
    for (const c of taken) {
      if (used.has(c.t.id)) continue
      if (quotes.some(([qs, qe]) => c.start >= qs && c.end <= qe)) continue
      const sp = spans.find((x) => c.start >= x.start && c.end <= x.end)
      if (!sp || sp.skipped) continue
      used.add(c.t.id)
      chosen.push({ ...c, sp })
    }
    // apply per text node, right to left
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
        out.push(buildTooltip(c.t, text, prefix + ++n))
        stats.push({ id: c.t.id, term: c.t.term, text, section })
        pos = le
      }
      if (pos < value.length) out.push({ type: "text", value: value.slice(pos) })
      parent.children.splice(idx, 1, ...out)
    }
  }
}

// ---------- client ----------
const css = `
.gt{position:relative;display:inline}
.gt-term{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:help;display:inline;
 text-align:inherit;letter-spacing:inherit;line-height:inherit;
 text-decoration:underline dotted var(--secondary);text-underline-offset:.18em;text-decoration-thickness:1.5px}
.gt-term:focus-visible{outline:2px solid var(--secondary);outline-offset:2px;border-radius:2px}
.gt-tip{display:none;position:fixed;left:0;top:0;z-index:999;width:min(22rem,calc(100vw - 16px));max-height:min(60vh,26rem);overflow:auto;
 background:var(--dark);color:var(--light);padding:.6rem .75rem;border-radius:8px;font-size:.86rem;line-height:1.45;
 border:0 solid transparent;border-top-width:6px;background-clip:padding-box;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25));font-weight:normal;font-style:normal;text-align:left;white-space:normal;text-indent:0}
.gt.gt-above>.gt-tip{border-top-width:0;border-bottom-width:6px}
.gt-tip strong{display:block;margin-bottom:.2rem;color:inherit}
.gt-tip .gt-link{color:inherit;text-decoration:underline;font-weight:600;background:none}
.gt-tip .gt-src{opacity:.8;font-size:.8rem}
.gt:hover>.gt-tip,.gt:focus-within>.gt-tip,.gt.open>.gt-tip{display:block}
.gt.gt-dismissed>.gt-tip{display:none!important}
.popover .gt-tip{display:none!important}
.popover .gt-term{cursor:inherit}
@media (max-width:640px){.gt-tip,.gt.gt-above>.gt-tip{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto;max-height:45vh;border-width:0}}
@media (hover:none){.gt:hover>.gt-tip{display:none}.gt.open>.gt-tip,.gt:focus-within>.gt-tip{display:block}}
@media print{.gt-tip{display:none!important}.gt-term{text-decoration:none}}
`

const script = `
(function(){
  if (window.__gtInit) return; window.__gtInit = true;
  var open = null, hov = null;
  function tipOf(g){ return g && g.querySelector(':scope > .gt-tip'); }
  function btnOf(g){ return g && g.querySelector(':scope > .gt-term'); }
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
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('.gt-term');
    if (b) {
      var g = b.parentNode, was = g.classList.contains('open');
      if (open && open !== g) close(open);
      g.classList.remove('gt-dismissed');
      if (was) close(g); else { g.classList.add('open'); b.setAttribute('aria-expanded','true'); open = g; requestAnimationFrame(function(){ place(g); }); }
      return;
    }
    if (open && !(ev.target.closest && ev.target.closest('.gt-tip'))) close(open);
  });
  document.addEventListener('keydown', function(ev){
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
    if (g) { requestAnimationFrame(function(){ place(g); }); }
  });
  document.addEventListener('focusout', function(ev){
    var g = ev.target.closest && ev.target.closest('.gt');
    if (g && !g.contains(ev.relatedTarget)) g.classList.remove('gt-dismissed');
  });
  document.addEventListener('mouseover', function(ev){
    var g = ev.target.closest && ev.target.closest('.gt');
    if (g === hov) return;
    if (hov) hov.classList.remove('gt-dismissed');
    hov = g;
    if (g) { place(g); requestAnimationFrame(function(){ place(g); }); }
  });
  window.addEventListener('scroll', function(){ if (open) place(open); if (hov) place(hov); }, {passive:true, capture:true});
  window.addEventListener('resize', function(){ if (open) place(open); });
  document.addEventListener('nav', function(){ open = null; hov = null; });
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

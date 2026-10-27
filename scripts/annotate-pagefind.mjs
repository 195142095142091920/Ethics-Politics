#!/usr/bin/env node
/**
 * Postbuild HTML annotator for Pagefind (414.onl / Quartz v5).
 * Mutates public HTML files in place. No content/*.md changes.
 *
 * Usage: node scripts/annotate-pagefind.mjs [--dry-run] [--root public]
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const rootIdx = args.indexOf("--root")
const root = path.resolve(rootIdx >= 0 ? args[rootIdx + 1] : "public")
const synonymsPath = path.join(__dirname, "pagefind-synonyms.json")

const SECTION_FROM_FILE = [
  [/^1[.-]/i, "Ethical & Philosophical Framework"],
  [/^2[.-]/i, "Political & Social Character"],
  [/^3[.-]/i, "Authority & Civil Liberties"],
  [/^4[.-]/i, "Religion & Secularism"],
  [/^5[.-]/i, "Domestic Policy & Governance"],
  [/^6[.-]/i, "Criminal Justice & Security"],
  [/^7[.-]/i, "Cultural & Social Issues"],
  [/^8[.-]/i, "Foreign Policy & International Relations"],
  [/^9[.-]/i, "Energy & Environment"],
  [/^10[.-]/i, "Bioethics, Progress & Technology"],
  [/^11[.-]/i, "Modern Political Parties"],
  [/^12[.-]/i, "Current Administration"],
  [/^13[.-]/i, "News Commentary"],
  [/^glossary/i, "Glossary"],
  [/^start-here/i, "Start Here"],
  [/^where-i-stand/i, "Where I Stand"],
  [/^index\.html$/i, "Home"],
]

function sectionFor(filename) {
  const base = path.basename(filename)
  for (const [re, name] of SECTION_FROM_FILE) {
    if (re.test(base)) return name
  }
  return "Other"
}

function typeFor(filename, html) {
  const base = path.basename(filename).toLowerCase()
  if (base.startsWith("glossary")) return "Glossary"
  if (base.startsWith("13.") || base.includes("news-commentary")) return "News"
  if (base.startsWith("start-here") || base.startsWith("where-i-stand") || base === "index.html")
    return "Index"
  if (html.includes('data-callout="question"')) return "Position" // pages with Q&A still Position; Q&A tagged per-callout
  return "Position"
}

function addAttr(tagOpen, attr, value) {
  if (new RegExp(`\\s${attr}=`).test(tagOpen)) return tagOpen
  return tagOpen.replace(/>$/, ` ${attr}="${value}">`)
}

function annotate(html, filename, synonyms) {
  let out = html
  const fileBase = path.basename(filename)
  const section = sectionFor(fileBase)
  const pageType = typeFor(fileBase, html)
  let changes = 0

  // Body: article.popover-hint
  // Pagefind allows only ONE inline name:value filter per attribute list — use two meta tags.
  const filterMeta =
    `<meta data-pagefind-filter="section:${section}" />` +
    `<meta data-pagefind-filter="type:${pageType}" />`
  out = out.replace(/<article(\s[^>]*class=["'][^"']*popover-hint[^"']*["'][^>]*)>/i, (m) => {
    if (/data-pagefind-body/.test(m)) return m
    changes++
    return m.replace(/>$/, " data-pagefind-body>")
  })
  if (!out.includes(`data-pagefind-filter="section:${section}"`)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n${filterMeta}`)
    changes++
  }

  // Ignore chrome
  const ignoreSelectors = [
    /<div(\s[^>]*class="[^"]*left sidebar[^"]*"[^>]*)>/gi,
    /<div(\s[^>]*class="[^"]*right sidebar[^"]*"[^>]*)>/gi,
    /<footer(\s[^>]*)>/gi,
  ]
  for (const re of ignoreSelectors) {
    out = out.replace(re, (m, attrs) => {
      if (/data-pagefind-ignore/.test(m)) return m
      changes++
      return m.replace(/>$/, ' data-pagefind-ignore="all">')
    })
  }

  // Contents callout (TOC-like) — ignore index only
  out = out.replace(
    /<blockquote(\s[^>]*data-callout="abstract"[^>]*)>/gi,
    (m) => {
      if (/data-pagefind-ignore/.test(m)) return m
      changes++
      return m.replace(/>$/, ' data-pagefind-ignore="index">')
    },
  )

  // Weights: h1=10, h2/h3=5; glossary h2=6
  const isGlossary = /glossary/i.test(fileBase)
  out = out.replace(/<(h1)(\s[^>]*)?>/gi, (m, tag, attrs = "") => {
    if (/data-pagefind-weight/.test(m)) return m
    changes++
    return `<${tag}${attrs} data-pagefind-weight="10">`
  })
  out = out.replace(/<(h2)(\s[^>]*)?>/gi, (m, tag, attrs = "") => {
    if (/data-pagefind-weight/.test(m)) return m
    changes++
    const w = isGlossary ? "6" : "5"
    return `<${tag}${attrs} data-pagefind-weight="${w}">`
  })
  out = out.replace(/<(h3)(\s[^>]*)?>/gi, (m, tag, attrs = "") => {
    if (/data-pagefind-weight/.test(m)) return m
    changes++
    return `<${tag}${attrs} data-pagefind-weight="5">`
  })

  // Q&A callout titles → weight 4 + type filter on the callout
  out = out.replace(
    /<blockquote(\s[^>]*data-callout="question"[^>]*)>/gi,
    (m) => {
      let tag = m
      if (!/data-pagefind-filter/.test(tag)) {
        changes++
        tag = tag.replace(/>$/, ' data-pagefind-filter="type:QA">')
      }
      return tag
    },
  )
  out = out.replace(
    /(<blockquote[^>]*data-callout="question"[^>]*>[\s\S]*?<div class="callout-title-inner"[^>]*>)/gi,
    (m) => {
      if (/data-pagefind-weight/.test(m)) return m
      changes++
      return m.replace(
        /(<div class="callout-title-inner")/,
        '$1 data-pagefind-weight="4"',
      )
    },
  )

  // Synonyms by heading id (bare id, or "slugFragment#id" for non-unique ids)
  const byId = synonyms.byHeadingId || {}
  const fileLower = fileBase.toLowerCase()
  for (const [key, words] of Object.entries(byId)) {
    if (!words?.length) continue
    let id = key
    if (key.includes("#")) {
      const [slugFrag, hid] = key.split("#")
      if (!fileLower.includes(slugFrag.toLowerCase())) continue
      id = hid
    }
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(<h[1-6][^>]*\\sid="${esc}"[^>]*>[\\s\\S]*?<\\/h[1-6]>)`, "i")
    if (!re.test(out)) continue
    const kw = words.join(" ")
    const span = `<span class="pf-syn" aria-hidden="true" data-pagefind-weight="4">${kw}</span>`
    let replaced = false
    out = out.replace(re, (m) => {
      if (replaced || m.includes("pf-syn")) return m
      replaced = true
      changes++
      return `${m}${span}`
    })
  }

  // Page-level slug keywords
  const bySlug = synonyms.byPageSlugContains || {}
  for (const [frag, words] of Object.entries(bySlug)) {
    if (!fileBase.toLowerCase().includes(frag.toLowerCase())) continue
    if (!words?.length) continue
    if (out.includes('data-pagefind-meta="keywords:')) continue
    const kw = words.join(", ")
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<meta data-pagefind-meta="keywords:${kw}" content="${kw}" />`,
    )
    changes++
  }

  // Tiny CSS so synonym spans stay invisible even if theme shifts
  if (out.includes("pf-syn") && !out.includes(".pf-syn{")) {
    out = out.replace(
      /<\/head>/i,
      `<style>.pf-syn{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>\n</head>`,
    )
  }

  return { html: out, changes, section, pageType }
}

async function walk(dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "pagefind" || e.name === "static" || e.name.startsWith(".")) continue
      out.push(...(await walk(p)))
    } else if (e.name.endsWith(".html")) {
      out.push(p)
    }
  }
  return out
}

async function main() {
  const synonyms = JSON.parse(await fs.readFile(synonymsPath, "utf8"))
  let files
  try {
    files = await walk(root)
  } catch (err) {
    console.error(`No public tree at ${root}. Run quartz build first.`)
    process.exit(1)
  }
  let total = 0
  const summary = []
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8")
    if (!raw.includes("popover-hint") && !/glossary/i.test(file)) continue
    const { html, changes, section, pageType } = annotate(raw, file, synonyms)
    if (changes === 0) continue
    total += changes
    summary.push(`${path.relative(root, file)}  +${changes}  [${section} / ${pageType}]`)
    if (!dryRun) await fs.writeFile(file, html)
  }
  console.log(
    `${dryRun ? "DRY RUN — " : ""}annotated ${summary.length} HTML files (${total} edits) under ${root}`,
  )
  for (const line of summary.slice(0, 40)) console.log(" ", line)
  if (summary.length > 40) console.log(`  … +${summary.length - 40} more`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

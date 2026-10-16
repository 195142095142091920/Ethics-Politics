// Emits static/topicIndex.json for the search plugin: one entry per h2 topic (slug#anchor).
import path from "path";
import fs from "fs/promises";
const TITLE_ONLY = new Set(["where-i-stand", "start-here", "index", "tags/index"]);
const ALIASES = { "world-health-organization": "WHO", "equal-treatment-in-employment-and-business": "DEI", "investor-visas": "EB-5", "ai-and-automation": "AGI" };
const skip = (n) => n.type === "element" && ((n.tagName === "blockquote" && n.properties?.dataCallout === "quote") || (n.tagName === "a" && n.properties?.role === "anchor") || n.tagName === "script" || n.tagName === "style");
const text = (n) => n.type === "text" ? n.value : skip(n) ? " " : (n.children || []).map(text).join(n.type === "element" && /^(p|li|h\d|td|th|div|blockquote|tr)$/.test(n.tagName) ? " " : "");
const clean = (s) => s.replace(/\s+/g, " ").trim();
export const TopicIndex = () => {
  const emitAll = async (ctx, content) => {
    const out = {};
    for (const [tree, file] of content) {
      const d = file.data ?? {};
      if (d.unlisted === true) continue;
      const slug = d.slug, fm = d.frontmatter ?? {}, title = fm.title ?? "", tags = fm.tags ?? [];
      const base = { slug, filePath: d.relativePath, title, links: [], tags };
      if (TITLE_ONLY.has(slug)) { out[slug] = { ...base, content: "" }; continue; }
      let cur = { key: slug, entry: { ...base, content: "" }, parts: [] };
      const flush = () => { cur.entry.content = clean(cur.parts.join(" ")); out[cur.key] = cur.entry; };
      for (const n of tree.children || []) {
        if (n.type === "element" && n.tagName === "h2" && n.properties?.id) {
          flush();
          const id = String(n.properties.id), alias = ALIASES[id] ? ` (${ALIASES[id]})` : "";
          cur = { key: `${slug}#${id}`, entry: { ...base, slug: `${slug}#${id}`, title: `${clean(text(n))}${alias} · ${title}` }, parts: [] };
        } else cur.parts.push(text(n));
      }
      flush();
    }
    const p = path.join(ctx.argv.output, "static", "topicIndex.json");
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(out));
    return [p];
  };
  return { name: "TopicIndex", emit: emitAll, partialEmit: emitAll };
};
export default TopicIndex;

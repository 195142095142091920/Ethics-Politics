import { visit, SKIP } from "unist-util-visit"

function nodeText(node) {
  if (!node) return ""
  if (node.type === "text") return node.value ?? ""
  if (!node.children) return ""
  return node.children.map(nodeText).join("")
}

function firstThLabel(table) {
  let label = null
  visit(table, "element", (n) => {
    if (label) return SKIP
    if (n.tagName === "th") {
      const t = nodeText(n).replace(/\s+/g, " ").trim()
      if (t) label = t
      return SKIP
    }
  })
  return label
}

function summaryFor(table) {
  const label = firstThLabel(table)
  if (!label) return "Table"
  return label.length > 48 ? `Table: ${label.slice(0, 45)}…` : `Table: ${label}`
}

/** Client: wrap any leftover .table-container (e.g. block transcludes) */
const wrapTablesInline = `
function wrapLooseTables() {
  const containers = Array.from(document.querySelectorAll(".table-container"));
  for (const el of containers) {
    if (el.closest("details.table-collapse")) continue;
    const table = el.querySelector("table");
    let label = "Table";
    if (table) {
      const th = table.querySelector("th");
      if (th) {
        const t = (th.textContent || "").replace(/\\s+/g, " ").trim();
        if (t) label = t.length > 48 ? "Table: " + t.slice(0, 45) + "…" : "Table: " + t;
      }
    }
    const details = document.createElement("details");
    details.className = "table-collapse";
    const summary = document.createElement("summary");
    summary.textContent = label;
    el.parentNode.insertBefore(details, el);
    details.appendChild(summary);
    details.appendChild(el);
  }
}
document.addEventListener("nav", wrapLooseTables);
document.addEventListener("render", wrapLooseTables);
`

const CollapsibleTables = () => {
  return {
    name: "CollapsibleTables",
    htmlPlugins() {
      return [
        () => (tree) => {
          const targets = []
          visit(tree, "element", (node, index, parent) => {
            if (node.tagName !== "table") return
            if (index === null || index === undefined || !parent) return
            targets.push({ node, index, parent })
          })
          for (let i = targets.length - 1; i >= 0; i--) {
            const { node, index, parent } = targets[i]
            if (
              parent.type === "element" &&
              parent.tagName === "details" &&
              (Array.isArray(parent.properties?.className)
                ? parent.properties.className.includes("table-collapse")
                : String(parent.properties?.className ?? "").includes("table-collapse"))
            ) {
              continue
            }
            const details = {
              type: "element",
              tagName: "details",
              properties: { className: ["table-collapse"] },
              children: [
                {
                  type: "element",
                  tagName: "summary",
                  properties: {},
                  children: [{ type: "text", value: summaryFor(node) }],
                },
                node,
              ],
            }
            parent.children[index] = details
          }
        },
      ]
    },
    externalResources() {
      return {
        js: [
          {
            script: wrapTablesInline,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
      }
    },
  }
}

export { CollapsibleTables }
export default CollapsibleTables

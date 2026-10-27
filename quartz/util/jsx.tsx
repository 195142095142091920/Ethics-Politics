import { Components, Jsx, toJsxRuntime } from "hast-util-to-jsx-runtime"
import { Node, Root } from "hast"
import { Fragment, jsx, jsxs } from "preact/jsx-runtime"
import { h, type ComponentChildren } from "preact"
import { trace } from "./trace"
import { type FilePath } from "./path"

function childrenToString(children: unknown): string {
  if (typeof children === "string") return children
  if (Array.isArray(children)) return children.map(childrenToString).join("")
  return String(children ?? "")
}

function firstTableHeaderLabel(children: unknown): string {
  const walk = (nodes: unknown): string | null => {
    if (!nodes) return null
    const arr = Array.isArray(nodes) ? nodes : [nodes]
    for (const n of arr) {
      if (!n || typeof n !== "object") continue
      const vnode = n as { type?: unknown; props?: { children?: unknown } }
      if (vnode.type === "th") {
        const t = childrenToString(vnode.props?.children).replace(/\s+/g, " ").trim()
        if (t) return t
      }
      const inner = walk(vnode.props?.children)
      if (inner) return inner
    }
    return null
  }
  const label = walk(children)
  if (!label) return "Table"
  // Keep summary short
  return label.length > 48 ? `Table: ${label.slice(0, 45)}…` : `Table: ${label}`
}

const customComponents: Components = {
  table: (props) => {
    const { children, ...rest } = props as {
      children?: ComponentChildren
    } & Record<string, unknown>
    const summary = firstTableHeaderLabel(children)
    return (
      <details class="table-collapse">
        <summary>{summary}</summary>
        <div class="table-container">
          <table {...rest}>{children}</table>
        </div>
      </details>
    )
  },
  style: ({ children, ...rest }) =>
    h("style", { ...rest, dangerouslySetInnerHTML: { __html: childrenToString(children) } }),
  script: ({ children, ...rest }) =>
    h("script", { ...rest, dangerouslySetInnerHTML: { __html: childrenToString(children) } }),
}

export function htmlToJsx(fp: FilePath, tree: Node) {
  try {
    return toJsxRuntime(tree as Root, {
      Fragment,
      jsx: jsx as Jsx,
      jsxs: jsxs as Jsx,
      elementAttributeNameCase: "html",
      components: customComponents,
    })
  } catch (e) {
    trace(`Failed to parse Markdown in \`${fp}\` into JSX`, e as Error)
  }
}

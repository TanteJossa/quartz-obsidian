import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Code } from "mdast"
// @ts-ignore
import obsidgetScript from "../../components/scripts/obsidget.inline"

export const Obsidget: QuartzTransformerPlugin = () => {
  return {
    name: "Obsidget",
    markdownPlugins() {
      return [
        () => (tree, _file) => {
          visit(tree, "code", (node: Code, index, parent: any) => {
            if (node.lang === "widget") {
              const parts = node.value.split(/^---$/m).map((part) => part.trim())
              
              let widgetId = `widget-${Math.random().toString(36).substr(2, 9)}`
              let html = ""
              let css = ""
              let js = ""
              let data = ""

              if (parts.length >= 5) {
                // 5-part format: ID, HTML, CSS, JS, Data
                widgetId = parts[0] || widgetId
                html = parts[1] || ""
                css = parts[2] || ""
                js = parts[3] || ""
                data = parts[4] || ""
              } else {
                // 4-part format: (ID + HTML), CSS, JS, Data
                html = parts[0] || ""
                css = parts[1] || ""
                js = parts[2] || ""
                data = parts[3] || ""

                if (html.startsWith("ID: ")) {
                  const lines = html.split("\n")
                  const idLine = lines.shift()!
                  widgetId = idLine.substring(4).trim()
                  html = lines.join("\n").trim()
                }
              }

              // Sanitize ID to prevent breaking HTML attributes
              widgetId = widgetId.replace(/[^a-zA-Z0-9-]/g, "-")

              const b64 = (s: string | undefined) => Buffer.from(s || "").toString("base64")

              const value = `<div class="obsidget" id="${widgetId}"><div style="display:none" class="obsidget-html">${b64(
                html,
              )}</div><div style="display:none" class="obsidget-css">${b64(
                css,
              )}</div><div style="display:none" class="obsidget-js">${b64(
                js,
              )}</div><div style="display:none" class="obsidget-state">${b64(
                data,
              )}</div></div>`

              const widgetNode = {
                type: "html",
                value: value,
              }

              console.log(`[Obsidget] Transformed widget ${widgetId}`)

              if (parent && parent.children && typeof index === "number") {
                parent.children[index] = widgetNode
              }
            }
          })
        },
      ]
    },
    externalResources() {
      return {
        js: [
          {
            script: obsidgetScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
      }
    },
  }
}

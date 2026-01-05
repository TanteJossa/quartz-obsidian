import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Code } from "mdast"
// @ts-ignore
import tikzScript from "../../components/scripts/tikz.inline"

export const TikZJax: QuartzTransformerPlugin = () => {
  return {
    name: "TikZJax",
    markdownPlugins() {
      return [
        () => (tree) => {
          visit(tree, "code", (node: Code) => {
            if (node.lang === "tikz") {
              const preamble = `
\\usepackage{chemfig}
\\usepackage{tikz-cd}
\\usepackage{circuitikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.16}
\\usepackage{amsmath, amstext, amsfonts, amssymb}
\\usepackage{tikz-3dplot}
`
              const content = `${preamble}\n${node.value}`
              // Transform the code block into a <script type="text/tikz"> tag
              node.data = {
                hName: "script",
                hProperties: {
                  type: "text/tikz",
                },
                hChildren: [
                  {
                    type: "text",
                    value: content,
                  },
                ],
              }
            }
          })
        },
      ]
    },
    externalResources() {
      return {
        css: [
          {
            content: "https://tikzjax.com/v1/fonts.css",
          },
        ],
        js: [
          {
            src: "https://tikzjax.com/v1/tikzjax.js",
            loadTime: "afterDOMReady",
            contentType: "external",
          },
          {
            script: tikzScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
      }
    },
  }
}

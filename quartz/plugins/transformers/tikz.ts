import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Code } from "mdast"
import tex2svgModule from "node-tikzjax"
// @ts-ignore
import tikzScript from "../../components/scripts/tikz.inline"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { styleText } from "util"
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "preact/jsx-runtime"

function colorSVGinDarkMode(svg: string) {
  return svg
    .replaceAll(/("#000"|"black")/g, `"currentColor"`)
    .replaceAll(/("#fff"|"white")/g, `"var(--background-primary)"`)
}

export const TikZJax: QuartzTransformerPlugin = () => {
  return {
    name: "TikZJax",
    markdownPlugins() {
      return [
        () => async (tree, file) => {
          const nodes: { node: Code; index: number; parent: any }[] = []
          
          visit(tree, "code", (node: Code, index, parent) => {
            if (node.lang === "tikz") {
              nodes.push({ node, index: index ?? 0, parent })
            }
          })

          if (nodes.length === 0) return

          // Setup cache directory
          const cacheDir = path.join(process.cwd(), ".quartz-cache", "tikz")
          if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true })
          }

          file.data.hasTikZ = true
          file.data.tikzFonts = file.data.tikzFonts ?? new Set<string>()

          try {
            for (const { node, index, parent } of nodes) {
              let preamble = `\\usepackage{amsmath, amstext, amsfonts, amssymb}\n`
              
              // Helper to check if package is already imported
              const hasPackage = (name: string) => new RegExp(`\\\\usepackage(\\[.*\\])?\\{${name}\\}`, 'g').test(node.value)
              
              // Dynamic preamble based on content
              if (!hasPackage('tikz')) {
                 preamble += `\\usepackage{tikz}\n`
              }
              if (!hasPackage('chemfig') && node.value.includes('chemfig')) {
                  preamble += `\\usepackage{chemfig}\n`
              }
              if (!hasPackage('tikz-cd') && (node.value.includes('tikzcd') || node.value.includes('tikz-cd'))) {
                  preamble += `\\usepackage{tikz-cd}\n`
              }
              if (!hasPackage('circuitikz') && node.value.includes('circuitikz')) {
                  preamble += `\\usepackage{circuitikz}\n`
              }
              if (!hasPackage('pgfplots') && (node.value.includes('pgfplots') || node.value.includes('axis') || node.value.includes('plot'))) {
                  preamble += `\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.16}\n`
              }
              if (!hasPackage('tikz-3dplot') && node.value.includes('tikz-3dplot')) {
                  preamble += `\\usepackage{tikz-3dplot}\n`
              }
              
              // Auto-load graphs.standard if subgraph is used (common pitfall)
              if (node.value.includes('subgraph') && !node.value.includes('graphs.standard')) {
                  preamble += `\\usetikzlibrary{graphs.standard}\n`
              }

              let content = node.value

              // Global fixes for specific packages that cause issues
              
              // Fix 1: circuitikz (remove siunitx, add patch)
              // We strip the user's import to force our robust configuration
              if (content.includes("circuitikz")) {
                  content = content.replace(/\\usepackage(\[.*?\])?{circuitikz}/g, "")
                  
                  if (!preamble.includes("circuitikz")) {
                     preamble += "\\usepackage{circuitikz}\n"
                     // Patch: siunitx allowed \Omega in text mode. Without it, \Omega is math-only.
                     preamble += "\\def\\Omega{\\ensuremath{\\mathchar\"700A}}\n"
                     preamble += "\\def\\mu{\\ensuremath{\\mathchar\"7016}}\n"
                  }
              }

              // Fix 2: tikz-cd (prefer library over package to avoid missing .sty)
              if (content.includes("tikz-cd") || content.includes("tikzcd")) {
                  content = content.replace(/\\usepackage(\[.*?\])?{tikz-cd}/g, "")
                  if (!preamble.includes("{cd}")) { 
                     preamble += "\\usetikzlibrary{cd}\n"
                  }
                  
              }
              // Fix: Clean source by removing blank lines (inspired by tikzjax-renderer.js)
              // This prevents \par tokens from breaking the matrix environment
              content = content
                  .replaceAll("&nbsp;", "")
                  .split("\n")
                  .map(line => line.trim())
                  .filter(line => line)
                  .join("\n")

              if (!content.includes("\\begin{document}")) {
                const lines = content.split('\n')
                let body = ""
                let userPreamble = ""
                
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (trimmed.startsWith("\\usepackage") || 
                      trimmed.startsWith("\\usetikzlibrary") || 
                      trimmed.startsWith("\\pgfplotsset")) {
                    userPreamble += line + "\n"
                  } else {
                    body += line + "\n"
                  }
                }
                
                content = `${userPreamble}\\begin{document}\n${body}\\end{document}`
              }

              content = `${preamble}\n${content}`
              
              // Generate hash for caching
              const hash = crypto.createHash('sha256').update(content).digest('hex')
              const cacheFile = path.join(cacheDir, `${hash}.svg`)

              let processedSvg = ""

              if (fs.existsSync(cacheFile)) {
                // Cache hit
                processedSvg = fs.readFileSync(cacheFile, 'utf-8')
                console.log(styleText("green", `[TikZ] Cache hit for block in ${file.path}`))
              } else {
                // Cache miss
                console.log(styleText("yellow", `[TikZ] Rendering block in ${file.path} (Hash: ${hash.substring(0, 8)}...)`))
                try {
                  // @ts-ignore
                  const convert = tex2svgModule.default || tex2svgModule
                  
                  console.log(styleText("blue", `[TikZ] Invoking tex2svg...`))
                  // Add timeout to rendering
                  const renderPromise = convert(content, { showConsole: true })
                  const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Rendering timed out after 60s")), 60000)
                  )
                  
                  const svg = await Promise.race([renderPromise, timeoutPromise]) as string
                  console.log(styleText("green", `[TikZ] tex2svg completed`))
                  
                  processedSvg = svg
                  processedSvg = processedSvg.replaceAll("&#173;", "&#172;")
                  processedSvg = colorSVGinDarkMode(processedSvg)

                  // Write to cache
                  fs.writeFileSync(cacheFile, processedSvg)
                  console.log(styleText("magenta", `[TikZ] Saved to cache`))
                } catch (e) {
                  console.error(styleText("red", `[TikZ] Error rendering TikZ block in ${file.path}:`), e)
                  console.log(styleText("yellow", `[TikZ] Failed Content:\n${content}`))
                  continue // Skip replacement if rendering fails
                }
              }
              
              // Detect used fonts in SVG
              const fontMatches = processedSvg.matchAll(/class=['"]([^'"]+)['"]/g)
              for (const match of fontMatches) {
                const classes = match[1].split(/\s+/)
                for (const cls of classes) {
                  // Most TikZ fonts used by tikzjax follow a specific naming convention
                  // but we check if a corresponding .css file exists just in case
                  if (fs.existsSync(path.join(process.cwd(), "quartz/static/tikzjax-fonts", `${cls}.css`))) {
                    (file.data.tikzFonts as Set<string>).add(cls)
                  }
                }
              }

              const svgNode = {
                type: 'html',
                value: `<div class="tikz-container">${processedSvg}</div>`
              }

              if (parent && parent.children) {
                 parent.children[index] = svgNode
              }
            }
          } catch (e) {
            console.error(styleText("red", "[TikZ] Error processing TikZ blocks:"), e)
          }
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
            script: tikzScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
        additionalHead: [
          (pageData) => {
            if (pageData.hasTikZ && pageData.tikzFonts) {
              const fonts = Array.from(pageData.tikzFonts as Set<string>)
              return _jsx(_Fragment, {
                children: fonts.map((font) => 
                  _jsx("link", {
                    rel: "stylesheet",
                    type: "text/css",
                    href: `/static/tikzjax-fonts/${font}.css`,
                    "data-persist": "true"
                  }, font)
                )
              })
            }
            return _jsx(_Fragment, {})
          },
        ],
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    hasTikZ?: boolean
    tikzFonts?: Set<string>
  }
}

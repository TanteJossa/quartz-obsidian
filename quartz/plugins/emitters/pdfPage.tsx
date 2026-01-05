import path from "path"
import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullPageLayout } from "../../cfg"
import { FilePath, pathToRoot, slugifyFilePath } from "../../util/path"
import { defaultContentPageLayout, sharedPageComponents } from "../../../quartz.layout"
import PDFContent from "../../components/pages/PDFContent"
import { write } from "./helpers"
import { glob } from "../../util/glob"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { QuartzPluginData } from "../vfile"
import { Root } from "hast"

async function processPDF(
  ctx: BuildCtx,
  fileData: QuartzPluginData,
  allFiles: QuartzPluginData[],
  opts: FullPageLayout,
  resources: StaticResources,
) {
  const slug = fileData.slug!
  const cfg = ctx.cfg.configuration
  const externalResources = pageResources(pathToRoot(slug), resources)
  const componentData: QuartzComponentProps = {
    ctx,
    fileData,
    externalResources,
    cfg,
    children: [],
    tree: { type: "root", children: [] } as Root, // Empty tree as we don't parse markdown
    allFiles,
  }

  const content = renderPage(cfg, slug, componentData, opts, externalResources)
  return write({
    ctx,
    content,
    slug,
    ext: ".html",
  })
}

export const PDFPage: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultContentPageLayout,
    pageBody: PDFContent(),
    ...userOpts,
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "PDFPage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((c) => c[1].data)
      const pdfs = await glob("**/*.pdf", ctx.argv.directory, ctx.cfg.configuration.ignorePatterns)

      for (const pdf of pdfs) {
        const slug = slugifyFilePath(pdf as FilePath, true)
        const fileData: QuartzPluginData = {
          slug,
          filePath: pdf as FilePath,
          frontmatter: { title: path.basename(pdf) },
        }

        yield processPDF(ctx, fileData, allFiles, opts, resources)
      }
    },
  }
}
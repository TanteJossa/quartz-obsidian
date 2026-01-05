import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import path from "path"

const PDFContent: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const title = fileData.frontmatter?.title ?? path.basename(fileData.filePath ?? "")
  // Calculate relative path to the PDF file
  // The HTML file and the PDF file are siblings in the output directory
  const pdfPath = `./${path.basename(fileData.filePath ?? "")}`

  return (
    <article class="popover-hint">
      <h1>{title}</h1>
      <iframe src={pdfPath} class="pdf" width="100%" height="600px" style="border: 0;"></iframe>
    </article>
  )
}

export default (() => PDFContent) satisfies QuartzComponentConstructor
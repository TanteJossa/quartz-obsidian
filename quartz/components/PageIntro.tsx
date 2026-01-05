import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/pageIntro.scss"
import { classNames } from "../util/lang"
import { FullSlug, transformLink } from "../util/path"

// @ts-ignore
import script from "./scripts/toc.inline"

interface Options {
  excludeFields: string[]
  collapseByDefault: boolean
}

const defaultOptions: Options = {
  excludeFields: [
    "title",
    "tags",
    "tag",
    "date",
    "created",
    "modified",
    "published",
    "description",
    "draft",
    "permalink",
    "aliases",
    "alias",
    "cssclasses",
    "cssclass",
    "socialDescription",
    "socialImage",
    "image",
    "cover",
    "comments",
    "lang",
    "enableToc",
    "publish",
  ],
  collapseByDefault: true,
}

export default ((opts?: Partial<Options>) => {
  const excludeFields = new Set(opts?.excludeFields ?? defaultOptions.excludeFields)
  const collapseByDefault = opts?.collapseByDefault ?? defaultOptions.collapseByDefault

  const PageIntro: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
    cfg,
    ctx,
  }: QuartzComponentProps) => {
    const frontmatter = fileData.frontmatter
    if (!frontmatter) return null

    const entries = Object.entries(frontmatter)
      .filter(([key, value]) => !excludeFields.has(key) && value !== undefined && value !== null)
      .map(([key, value]) => ({ key, value }))

    if (entries.length === 0) return null

    // Helper to parse wikilinks [[link|alias]] or [[link]]
    const parseWikilink = (text: string) => {
      const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
      const parts: (string | any)[] = []
      let lastIndex = 0
      let match

      while ((match = wikilinkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index))
        }

        const link = match[1].trim()
        const alias = match[2]?.trim() || link
        const linkDest = transformLink(fileData.slug!, link, {
          strategy: "shortest",
          allSlugs: ctx.allSlugs,
        })

        parts.push(
          <a href={linkDest} class="internal">
            {alias}
          </a>,
        )

        lastIndex = wikilinkRegex.lastIndex
      }

      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex))
      }

      return parts.length > 0 ? parts : text
    }

    const renderValue = (value: any): any => {
      if (typeof value === "string") {
        return parseWikilink(value)
      }
      if (Array.isArray(value)) {
        return value.map((v, i) => (
          <span key={i}>
            {renderValue(v)}
            {i < value.length - 1 ? ", " : ""}
          </span>
        ))
      }
      if (typeof value === "object" && value !== null) {
        return JSON.stringify(value)
      }
      return String(value)
    }

    return (
      <div class={classNames(displayClass, "page-intro toc")}>
        <button
          type="button"
          class={`intro-header toc-header ${collapseByDefault ? "collapsed" : ""}`}
          aria-expanded={!collapseByDefault}
        >
          <h3>Metadata</h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <ul class={`intro-content toc-content ${collapseByDefault ? "collapsed" : ""}`}>
          {entries.map((entry) => (
            <li key={entry.key}>
              <strong>{entry.key}:</strong>
              {renderValue(entry.value)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  PageIntro.css = style
  PageIntro.afterDOMLoaded = script

  return PageIntro
}) satisfies QuartzComponentConstructor

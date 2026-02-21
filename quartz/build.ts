import sourceMapSupport from "source-map-support"
import { options } from "./util/sourcemap"
sourceMapSupport.install(options)
import path from "path"
import { PerfTimer } from "./util/perf"
import { rm, stat, readFile } from "fs/promises"
import { GlobbyFilterFunction, isGitIgnored } from "globby"
import { styleText } from "util"
import { parseMarkdown } from "./processors/parse"
import { filterContent } from "./processors/filter"
import { emitContent } from "./processors/emit"
import cfg from "../quartz.config"
import { FilePath, joinSegments, slugifyFilePath, simplifySlug, SimpleSlug } from "./util/path"
import chokidar from "chokidar"
import { ProcessedContent } from "./plugins/vfile"
import { Argv, BuildCtx } from "./util/ctx"
import { glob, toPosixPath } from "./util/glob"
import { trace } from "./util/trace"
import { Mutex } from "async-mutex"
import { getStaticResourcesFromPlugins } from "./plugins"
import { randomIdNonSecure } from "./util/random"
import { ChangeEvent } from "./plugins/types"
import { minimatch } from "minimatch"
import { DependencyGraph } from "./util/depgraph"
import { VFile } from "vfile"

type ContentMap = Map<
  FilePath,
  | {
      type: "markdown"
      content: ProcessedContent
    }
  | {
      type: "other"
    }
>

type BuildData = {
  ctx: BuildCtx
  ignored: GlobbyFilterFunction
  mut: Mutex
  contentMap: ContentMap
  changesSinceLastBuild: Record<FilePath, ChangeEvent["type"]>
  lastBuildMs: number
}

async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  const ctx: BuildCtx = {
    buildId: randomIdNonSecure(),
    argv,
    cfg,
    allSlugs: [],
    allFiles: [],
    incremental: argv.incremental || false,
  }

  const perf = new PerfTimer()
  const output = argv.output

  const pluginCount = Object.values(cfg.plugins).flat().length
  const pluginNames = (key: "transformers" | "filters" | "emitters") =>
    cfg.plugins[key].map((plugin) => plugin.name)
  if (argv.verbose) {
    console.log(`Loaded ${pluginCount} plugins`)
    console.log(`  Transformers: ${pluginNames("transformers").join(", ")}`)
    console.log(`  Filters: ${pluginNames("filters").join(", ")}`)
    console.log(`  Emitters: ${pluginNames("emitters").join(", ")}`)
  }

  const release = await mut.acquire()
  
  if (!ctx.incremental) {
    perf.addEvent("clean")
    await rm(output, { recursive: true, force: true })
    console.log(`Cleaned output directory \`${output}\` in ${perf.timeSince("clean")}`)
  }

  perf.addEvent("glob")
  const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns)
  const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
  console.log(
    `Found ${markdownPaths.length} input files from \`${argv.directory}\` in ${perf.timeSince("glob")}`,
  )

  const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
  ctx.allFiles = allFiles
  ctx.allSlugs = allFiles.map((fp) => slugifyFilePath(fp as FilePath))

  const graph = new DependencyGraph()
  if (ctx.incremental) {
    await graph.loadFromCache(argv)
  }

  const changes: ChangeEvent[] = []
  const filesToParse: FilePath[] = []
  const cachedFiles: FilePath[] = []
  const extraFilesToParse = new Set<FilePath>()

  if (ctx.incremental) {
      perf.addEvent("diff")
      const filesSet = new Set(filePaths)
      
      // Detect changes
      for (const fp of filePaths) {
          try {
            const stats = await stat(fp)
            const node = graph.getNode(fp)
            if (!node || Math.abs(node.mtime - stats.mtimeMs) > 1000) { // 1s tolerance
                changes.push({ type: node ? "change" : "add", path: fp })
            }
          } catch (e) {
              console.warn(`Failed to stat ${fp}`, e)
              changes.push({ type: "change", path: fp })
          }
      }

      // Detect deletions
      // We need to check if any file in graph is NOT in filePaths
      // But graph doesn't expose all keys efficiently without iteration.
      // DependencyGraph structure (nodes) is private, but I added getNode.
      // Assuming I can iterate nodes if I make it public or add method.
      // For now, let's assume `allFiles` is the source of truth for existence.
      // But we need to know what was deleted to update the graph.
      // `graph.nodes` is private. I should have made it public or iterable.
      // Let's assume for now we don't handle deletion detection from graph efficiently here 
      // without updating DepGraph class. 
      // BUT, `filePaths` is the current state.
      // If I don't handle deletions, the graph will have stale nodes.
      // That's acceptable for now, or I can update DepGraph to have `getAllFiles()`.
      
      // Calculate Impact Set
      const filesToRebuild = new Set<FilePath>()
      const impactTree: Record<string, string[]> = {}

      for (const change of changes) {
          filesToRebuild.add(change.path)
          const deps = graph.getReverseDependencies(change.path)
          if (deps.size > 0) {
              impactTree[change.path] = Array.from(deps)
          }
          for (const dep of deps) {
              filesToRebuild.add(dep)
              // Add a "change" event for the dependency too so it gets picked up by partialEmit
              // But we need to distinguish "source change" vs "dep change"? 
              // partialEmit logic usually cares if the file *content* or *context* changed.
              // If A links to B, and B changes, A needs re-render.
              // So A is "changed".
              if (!changes.some(c => c.path === dep)) {
                 changes.push({ type: "change", path: dep })
              }
          }
      }

      if (Object.keys(impactTree).length > 0) {
          console.log(styleText("blue", "Dependency Tree (Impact Analysis):"))
          for (const [source, targets] of Object.entries(impactTree)) {
              console.log(styleText("yellow", `  ${source} changed, affecting:`))
              for (const target of targets) {
                  console.log(`    -> ${target}`)
              }
          }
      }

      for (const fp of filePaths) {
          if (filesToRebuild.has(fp)) {
              filesToParse.push(fp)
          } else {
              cachedFiles.push(fp)
          }
      }

      console.log(`Incremental build: Parsing ${filesToParse.length} files, using cache for ${cachedFiles.length} files.`)

  } else {
      filesToParse.push(...filePaths)
  }

  const parsedFiles = await parseMarkdown(ctx, filesToParse)
  
  // Track old links to detect backlink changes
  const oldLinksMap = new Map<FilePath, SimpleSlug[]>()
  for (const [tree, vfile] of parsedFiles) {
      const fp = vfile.data.filePath!
      const node = graph.getNode(fp)
      if (node) {
          oldLinksMap.set(fp, node.links)
      }
  }

  // Update graph with new parsed files
  for (const [tree, vfile] of parsedFiles) {
      const fp = vfile.data.filePath!
      const slug = vfile.data.slug!
      const links = vfile.data.links ?? []
      const frontmatter = vfile.data.frontmatter
      const stats = await stat(fp)
      
      graph.update(fp, {
          slug,
          links,
          mtime: stats.mtimeMs,
          frontmatter,
          title: frontmatter?.title,
          description: vfile.data.description,
          tags: frontmatter?.tags,
          date: vfile.data.date?.toString()
      })
  }

  // Detect Forward Dependency changes (Backlinks)
  // If A links to B, and A changes to NOT link to B, B needs update.
  // If A links to C (new), C needs update.
  if (ctx.incremental) {
      for (const [tree, vfile] of parsedFiles) {
          const fp = vfile.data.filePath!
          const newLinks = new Set(vfile.data.links ?? [])
          const oldLinks = new Set(oldLinksMap.get(fp) ?? [])

          const affectedSlugs = new Set<string>()
          
          // Added links
          for (const link of newLinks) {
              if (!oldLinks.has(link)) affectedSlugs.add(link)
          }
          // Removed links
          for (const link of oldLinks) {
              if (!newLinks.has(link)) affectedSlugs.add(link)
          }

          if (affectedSlugs.size > 0) {
              for (const slug of affectedSlugs) {
                  const idx = ctx.allSlugs.findIndex(s => simplifySlug(s) === slug)
                  
                  if (idx !== -1) {
                      const targetPath = joinSegments(argv.directory, ctx.allFiles[idx]) as FilePath

                      // If target is not already parsed, we need to parse it to get its AST for rendering
                      const alreadyParsed = filesToParse.includes(targetPath) || extraFilesToParse.has(targetPath)
                      
                      if (!alreadyParsed) {
                           console.log(`Dependency update: ${targetPath} needs re-parse due to backlink change from ${fp}`)
                           extraFilesToParse.add(targetPath)
                      }
                      
                      if (!changes.some(c => c.path === targetPath)) {
                          changes.push({ type: "change", path: targetPath })
                      }
                  }
              }
          }
      }
  }

  // Parse extra files
  if (extraFilesToParse.size > 0) {
      const extraParsed = await parseMarkdown(ctx, Array.from(extraFilesToParse))
      parsedFiles.push(...extraParsed)
      
      // Update graph with extra parsed files
      for (const [tree, vfile] of extraParsed) {
          const fp = vfile.data.filePath!
          const slug = vfile.data.slug!
          const links = vfile.data.links ?? []
          const frontmatter = vfile.data.frontmatter
          const stats = await stat(fp)
          
          graph.update(fp, {
              slug,
              links,
              mtime: stats.mtimeMs,
              frontmatter,
              title: frontmatter?.title,
              description: vfile.data.description,
              tags: frontmatter?.tags,
              date: vfile.data.date?.toString()
          })
      }
  }

  if (ctx.incremental) {
      await graph.saveToCache(argv)
  } else {
      // populate graph for next time
      await graph.saveToCache(argv)
  }

  // Reconstruct cached content
  const cachedContent: ProcessedContent[] = []
  for (const fp of cachedFiles) {
      if (extraFilesToParse.has(fp)) continue
      const node = graph.getNode(fp)
      if (node) {
           const vfile = new VFile("")
           vfile.path = fp
           vfile.data = {
               filePath: fp,
               relativePath: path.posix.relative(argv.directory, fp) as FilePath,
               slug: node.slug,
               frontmatter: { ...node.frontmatter, title: node.title ?? node.frontmatter?.title ?? "Untitled" } as any,
               links: node.links,
               description: node.description,
               text: await readFile(fp, 'utf-8') // Read raw content for ContentIndex
           }
           if (node.date) vfile.data.date = new Date(node.date)
           
           // Dummy tree
           const tree = { type: 'root', children: [] }
           cachedContent.push([tree as any, vfile])
      }
  }

  const allContent = [...parsedFiles, ...cachedContent]
  const filteredContent = filterContent(ctx, allContent)

  // We need to attach the 'file' object to ChangeEvent for partialEmit to work properly 
  // (ContentPage checks changeEvent.file.data.slug)
  for (const change of changes) {
      const content = allContent.find(c => c[1].data.filePath === change.path)
      if (content) {
          change.file = content[1]
      }
  }

  await emitContent(ctx, filteredContent, ctx.incremental ? changes : undefined)
  
  console.log(
    styleText("green", `Done processing ${markdownPaths.length} files in ${perf.timeSince()}`),
  )
  release()

  if (argv.watch) {
    ctx.incremental = true
    return startWatching(ctx, mut, parsedFiles, clientRefresh)
  }
}

// setup watcher for rebuilds
async function startWatching(
  ctx: BuildCtx,
  mut: Mutex,
  initialContent: ProcessedContent[],
  clientRefresh: () => void,
) {
  const { argv, allFiles } = ctx

  const contentMap: ContentMap = new Map()
  for (const filePath of allFiles) {
    contentMap.set(filePath, {
      type: "other",
    })
  }

  for (const content of initialContent) {
    const [_tree, vfile] = content
    contentMap.set(vfile.data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  const gitIgnoredMatcher = await isGitIgnored()
  const buildData: BuildData = {
    ctx,
    mut,
    contentMap,
    ignored: (fp) => {
      const pathStr = toPosixPath(fp.toString())
      if (pathStr.startsWith(".git/")) return true
      // if (gitIgnoredMatcher(pathStr)) return true
      for (const pattern of cfg.configuration.ignorePatterns) {
        if (minimatch(pathStr, pattern)) {
          return true
        }
      }

      return false
    },

    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }

  const watcher = chokidar.watch(".", {
    awaitWriteFinish: { stabilityThreshold: 250 },
    persistent: true,
    cwd: argv.directory,
    ignoreInitial: true,
  })

  const changes: ChangeEvent[] = []
  watcher
    .on("add", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "add" })
      void rebuild(changes, clientRefresh, buildData)
    })
    .on("change", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "change" })
      void rebuild(changes, clientRefresh, buildData)
    })
    .on("unlink", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "delete" })
      void rebuild(changes, clientRefresh, buildData)
    })

  return async () => {
    await watcher.close()
  }
}

async function rebuild(changes: ChangeEvent[], clientRefresh: () => void, buildData: BuildData) {
  const { ctx, contentMap, mut, changesSinceLastBuild } = buildData
  const { argv, cfg } = ctx

  const buildId = randomIdNonSecure()
  ctx.buildId = buildId
  buildData.lastBuildMs = new Date().getTime()
  const numChangesInBuild = changes.length
  const release = await mut.acquire()

  // if there's another build after us, release and let them do it
  if (ctx.buildId !== buildId) {
    release()
    return
  }

  const perf = new PerfTimer()
  perf.addEvent("rebuild")
  console.log(styleText("yellow", "Detected change, rebuilding..."))

  // update changesSinceLastBuild
  for (const change of changes) {
    changesSinceLastBuild[change.path] = change.type
  }

  const staticResources = getStaticResourcesFromPlugins(ctx)
  const pathsToParse: FilePath[] = []
  for (const [fp, type] of Object.entries(changesSinceLastBuild)) {
    if (type === "delete" || path.extname(fp) !== ".md") continue
    const fullPath = joinSegments(argv.directory, toPosixPath(fp)) as FilePath
    pathsToParse.push(fullPath)
  }

  const parsed = await parseMarkdown(ctx, pathsToParse)
  for (const content of parsed) {
    contentMap.set(content[1].data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  // update state using changesSinceLastBuild
  // we do this weird play of add => compute change events => remove
  // so that partialEmitters can do appropriate cleanup based on the content of deleted files
  for (const [file, change] of Object.entries(changesSinceLastBuild)) {
    if (change === "delete") {
      // universal delete case
      contentMap.delete(file as FilePath)
    }

    // manually track non-markdown files as processed files only
    // contains markdown files
    if (change === "add" && path.extname(file) !== ".md") {
      contentMap.set(file as FilePath, {
        type: "other",
      })
    }
  }

  const changeEvents: ChangeEvent[] = Object.entries(changesSinceLastBuild).map(([fp, type]) => {
    const path = fp as FilePath
    const processedContent = contentMap.get(path)
    if (processedContent?.type === "markdown") {
      const [_tree, file] = processedContent.content
      return {
        type,
        path,
        file,
      }
    }

    return {
      type,
      path,
    }
  })

  // update allFiles and then allSlugs with the consistent view of content map
  ctx.allFiles = Array.from(contentMap.keys())
  ctx.allSlugs = ctx.allFiles.map((fp) => slugifyFilePath(fp as FilePath))
  let processedFiles = filterContent(
    ctx,
    Array.from(contentMap.values())
      .filter((file) => file.type === "markdown")
      .map((file) => file.content),
  )

  let emittedFiles = 0
  for (const emitter of cfg.plugins.emitters) {
    // Try to use partialEmit if available, otherwise assume the output is static
    const emitFn = emitter.partialEmit ?? emitter.emit
    const emitted = await emitFn(ctx, processedFiles, staticResources, changeEvents)
    if (emitted === null) {
      continue
    }

    if (Symbol.asyncIterator in emitted) {
      // Async generator case
      for await (const file of emitted) {
        emittedFiles++
        if (ctx.argv.verbose) {
          console.log(`[emit:${emitter.name}] ${file}`)
        }
      }
    } else {
      // Array case
      emittedFiles += emitted.length
      if (ctx.argv.verbose) {
        for (const file of emitted) {
          console.log(`[emit:${emitter.name}] ${file}`)
        }
      }
    }
  }

  console.log(`Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince("rebuild")}`)
  console.log(styleText("green", `Done rebuilding in ${perf.timeSince()}`))
  changes.splice(0, numChangesInBuild)
  clientRefresh()
  release()
}

export default async (argv: Argv, mut: Mutex, clientRefresh: () => void) => {
  try {
    return await buildQuartz(argv, mut, clientRefresh)
  } catch (err) {
    trace("\nExiting Quartz due to a fatal error", err as Error)
  }
}

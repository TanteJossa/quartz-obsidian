import { FilePath, FullSlug, SimpleSlug, simplifySlug } from "./path"
import fs from "fs"
import path from "path"
import { ProcessedContent } from "../plugins/vfile"

export interface FileNode {
  filePath: FilePath
  slug: FullSlug
  links: SimpleSlug[] // Outgoing links
  mtime: number // Modification time
  incoming: Set<FilePath> // Files that link to this file (Reverse Deps)
  frontmatter?: Record<string, any>
  title?: string
  description?: string
  tags?: string[]
  date?: string // ISO string
}

export type DepGraphData = Record<FilePath, Omit<FileNode, "incoming">>

export class DependencyGraph {
  private nodes: Map<FilePath, FileNode> = new Map()
  private static CACHE_FILE = ".quartz-cache/graph.json"

  constructor() {
    this.nodes = new Map()
  }

  // Load graph from disk
  async loadFromCache(argv: { directory: string }) {
    const cachePath = path.join(argv.directory, DependencyGraph.CACHE_FILE)
    try {
      if (fs.existsSync(cachePath)) {
        const data = await fs.promises.readFile(cachePath, "utf-8")
        const json: DepGraphData = JSON.parse(data)
        
        for (const [filePath, node] of Object.entries(json)) {
            this.nodes.set(filePath as FilePath, {
                ...node,
                incoming: new Set()
            })
        }

        // Rebuild incoming links
        for (const [source, node] of this.nodes) {
            for (const targetSlug of node.links) {
                // We need to map targetSlug back to a FilePath. 
                // This is tricky because slugs are not 1:1 with filepaths (index.md).
                // However, for the purpose of "what refers to what", we can look up which node has this slug.
                for (const [potentialTarget, targetNode] of this.nodes) {
                    if (simplifySlug(targetNode.slug) === targetSlug) {
                        targetNode.incoming.add(source)
                    }
                }
            }
        }
      }
    } catch (err) {
      console.warn("Failed to load dependency graph cache:", err)
    }
  }

  // Update a node in the graph
  update(filePath: FilePath, data: Partial<FileNode>) {
    // If node existed, remove its old outgoing links from others' incoming
    const existing = this.nodes.get(filePath)
    
    // If links are being updated, handle reverse deps
    if (data.links && existing) {
        // Remove self from old targets' incoming
        for (const oldLink of existing.links) {
             for (const [targetPath, targetNode] of this.nodes) {
                if (simplifySlug(targetNode.slug) === oldLink) {
                    targetNode.incoming.delete(filePath)
                }
            }
        }
    }

    const node: FileNode = {
      filePath,
      slug: data.slug ?? existing?.slug ?? "" as FullSlug,
      links: data.links ?? existing?.links ?? [],
      mtime: data.mtime ?? existing?.mtime ?? 0,
      incoming: existing?.incoming ?? new Set(),
      frontmatter: data.frontmatter ?? existing?.frontmatter,
      title: data.title ?? existing?.title,
      description: data.description ?? existing?.description,
      tags: data.tags ?? existing?.tags,
      date: data.date ?? existing?.date
    }
    this.nodes.set(filePath, node)

    // Add self to new targets' incoming
    if (data.links) {
        for (const newLink of data.links) {
            for (const [targetPath, targetNode] of this.nodes) {
                if (simplifySlug(targetNode.slug) === newLink) {
                    targetNode.incoming.add(filePath)
                }
            }
        }
    }
  }

  remove(filePath: FilePath) {
      const existing = this.nodes.get(filePath)
      if (existing) {
          for (const oldLink of existing.links) {
             for (const [targetPath, targetNode] of this.nodes) {
                if (simplifySlug(targetNode.slug) === oldLink) {
                    targetNode.incoming.delete(filePath)
                }
            }
        }
        this.nodes.delete(filePath)
      }
  }

  getNode(filePath: FilePath) {
      return this.nodes.get(filePath)
  }

  // Save graph to disk
  async saveToCache(argv: { directory: string }) {
    const cacheDir = path.join(argv.directory, ".quartz-cache")
    if (!fs.existsSync(cacheDir)) {
      await fs.promises.mkdir(cacheDir, { recursive: true })
    }
    const cachePath = path.join(argv.directory, DependencyGraph.CACHE_FILE)
    
    const data: DepGraphData = {}
    for (const [filePath, node] of this.nodes) {
        // Don't save 'incoming' as it can be reconstructed
        const { incoming, ...rest } = node
        data[filePath] = rest
    }

    await fs.promises.writeFile(cachePath, JSON.stringify(data, null, 2))
  }

  // Get files that depend on the given file (Reverse dependencies)
  getReverseDependencies(filePath: FilePath): Set<FilePath> {
    const node = this.nodes.get(filePath)
    return node ? node.incoming : new Set()
  }
}

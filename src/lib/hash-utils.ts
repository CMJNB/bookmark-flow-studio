import type { ExportNode } from "../types/bookmark"

/** DJB2-based hash, returns 7-character base-36 string. */
export function hashUrl(url: string): string {
  let h = 5381
  for (let i = 0; i < url.length; i++) {
    h = Math.imul(h, 33) ^ url.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(36).padStart(7, "0").slice(-7)
}

/** Build hash → url map from flat-walked ExportNode tree. */
export function buildHashMap(nodes: ExportNode[]): Record<string, string> {
  const map: Record<string, string> = {}
  function walk(items: ExportNode[]): void {
    for (const node of items) {
      if (node.url) {
        map[hashUrl(node.url)] = node.url
      }
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return map
}

function yamlScalar(text: string): string {
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
  return `"${escaped}"`
}

/** Serialize ExportNode tree to YAML using short hash tokens in place of full URLs. */
export function toYamlWithHashes(nodes: ExportNode[], indent = 0): string {
  const sp = "  ".repeat(indent)
  let out = ""
  for (const node of nodes) {
    out += `${sp}- title: ${yamlScalar(node.title)}\n`
    if (node.url) {
      out += `${sp}  hash: ${yamlScalar(hashUrl(node.url))}\n`
    }
    if (node.children?.length) {
      out += `${sp}  children:\n`
      out += toYamlWithHashes(node.children, indent + 2)
    }
  }
  return out
}

type HashImportNode = {
  title?: unknown
  hash?: unknown
  url?: unknown
  children?: unknown[]
}

/** Count resolved and unresolved hash entries recursively. */
function countResolved(items: ExportNode[]): { resolved: number; unresolved: number } {
  let resolved = 0
  let unresolved = 0
  for (const node of items) {
    if (node.url) {
      if ((node as ExportNode & { _unresolved?: boolean })._unresolved) {
        unresolved++
      } else {
        resolved++
      }
    }
    if (node.children?.length) {
      const sub = countResolved(node.children)
      resolved += sub.resolved
      unresolved += sub.unresolved
    }
  }
  return { resolved, unresolved }
}

/** Recursively resolve a hash-based import structure to ExportNode tree. */
export function resolveHashImport(
  items: unknown[],
  hashMap: Record<string, string>
): Array<ExportNode & { _unresolved?: boolean }> {
  return items.map((item) => {
    const node = item as HashImportNode
    const title = typeof node.title === "string" && node.title ? node.title : "Untitled"

    if (typeof node.hash === "string") {
      const url = hashMap[node.hash]
      if (url) {
        return { title, url }
      }
      // Keep as a placeholder bookmark; mark as unresolved for status reporting
      return { title: `[hash:${node.hash}] ${title}`, _unresolved: true } as ExportNode & { _unresolved: boolean }
    }

    if (typeof node.url === "string" && node.url) {
      return { title, url: node.url }
    }

    if (Array.isArray(node.children) && node.children.length) {
      return { title, children: resolveHashImport(node.children, hashMap) }
    }

    return { title }
  })
}

/** Count resolved / unresolved in the result of resolveHashImport. */
export function countHashResolution(nodes: ReturnType<typeof resolveHashImport>): {
  resolved: number
  unresolved: number
} {
  return countResolved(nodes as ExportNode[])
}

import type { BookmarkEntry, BookmarkNode } from "../types/bookmark"

export type BookmarkHtmlNode = {
  title: string
  url?: string
  children?: BookmarkHtmlNode[]
  dateAdded?: number
  dateGroupModified?: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function toBookmarkTimestamp(value?: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return String(Math.floor(value/1000))
}

function buildAttribute(name: string, value?: number): string {
  const normalized = toBookmarkTimestamp(value)
  return normalized ? ` ${name}="${normalized}"` : ""
}

function renderNode(node: BookmarkHtmlNode, depth: number): string {
  const indent = "  ".repeat(depth)
  const safeTitle = escapeHtml(node.title || "Untitled")

  if (node.url) {
    const safeUrl = escapeHtml(node.url)
    return `${indent}<DT><A HREF="${safeUrl}"${buildAttribute("ADD_DATE", node.dateAdded)}>${safeTitle}</A>\n`
  }

  const children = node.children ?? []
  const body = children.map((child) => renderNode(child, depth + 1)).join("")

  return (
    `${indent}<DT><H3${buildAttribute("ADD_DATE", node.dateAdded)}${buildAttribute("LAST_MODIFIED", node.dateGroupModified)}>${safeTitle}</H3>\n` +
    `${indent}<DL><p>\n` +
    body +
    `${indent}</DL><p>\n`
  )
}

export function bookmarkTreeToHtml(nodes: BookmarkHtmlNode[], rootTitle = "Bookmarks"): string {
  const safeRootTitle = escapeHtml(rootTitle)
  const body = nodes.map((node) => renderNode(node, 1)).join("")

  return [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file.",
    "     It will be read and overwritten.",
    "     DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${safeRootTitle}</TITLE>`,
    `<H1>${safeRootTitle}</H1>`,
    "<DL><p>",
    `${body}</DL><p>`,
    ""
  ].join("\n")
}

export function bookmarkNodesToHtmlTree(nodes: BookmarkNode[]): BookmarkHtmlNode[] {
  const walk = (node: BookmarkNode): BookmarkHtmlNode => {
    const children = node.children?.map(walk)

    return {
      title: node.title || "",
      url: node.url,
      dateAdded: node.dateAdded,
      dateGroupModified: node.dateGroupModified,
      children: children?.length ? children : undefined
    }
  }

  return nodes.map(walk)
}

export function buildHtmlTreeFromEntries(entries: BookmarkEntry[]): BookmarkHtmlNode[] {
  const roots: BookmarkHtmlNode[] = []

  for (const entry of entries) {
    let currentLevel = roots

    for (const segment of entry.pathSegments) {
      let folder = currentLevel.find((node) => !node.url && node.title === segment)
      if (!folder) {
        folder = { title: segment, children: [] }
        currentLevel.push(folder)
      }

      if (!folder.children) {
        folder.children = []
      }

      currentLevel = folder.children
    }

    currentLevel.push({
      title: entry.title,
      url: entry.url,
      dateAdded: entry.dateAdded
    })
  }

  return roots
}
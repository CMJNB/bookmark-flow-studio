import type { BookmarkNode, ExportNode, FolderTreeNode } from "../types/bookmark"

export function nodeToSlim(node: BookmarkNode): ExportNode {
  const out: ExportNode = { title: node.title ?? "" }
  if (node.url) {
    out.url = node.url
  }
  if (node.children?.length) {
    out.children = node.children.map(nodeToSlim)
  }
  return out
}

export function nodeToFull(node: BookmarkNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: node.id,
    parentId: node.parentId,
    title: node.title ?? "",
    url: node.url,
    index: node.index,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified
  }

  if (node.children?.length) {
    out.children = node.children.map(nodeToFull)
  }
  return out
}

export function buildFolderTree(nodes: BookmarkNode[]): FolderTreeNode[] {
  function toFolderTree(node: BookmarkNode): FolderTreeNode | null {
    if (!Array.isArray(node.children)) {
      return null
    }

    const children: FolderTreeNode[] = []
    for (const child of node.children) {
      const childTree = toFolderTree(child)
      if (childTree) {
        children.push(childTree)
      }
    }

    if (node.id === "0") {
      return {
        id: node.id,
        title: node.title || "Root",
        children
      }
    }

    return {
      id: node.id,
      title: node.title || "未命名文件夹",
      children
    }
  }

  const roots: FolderTreeNode[] = []
  for (const node of nodes) {
    const tree = toFolderTree(node)
    if (tree) {
      if (tree.id === "0") {
        roots.push(...tree.children)
      } else {
        roots.push(tree)
      }
    }
  }
  return roots
}

export function flattenFolderTreeIds(tree: FolderTreeNode[]): string[] {
  const ids: string[] = []
  const walk = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      ids.push(node.id)
      if (node.children.length) {
        walk(node.children)
      }
    }
  }
  walk(tree)
  return ids
}

export function flattenNodes(nodes: BookmarkNode[]): Map<string, BookmarkNode> {
  const map = new Map<string, BookmarkNode>()

  function walk(node: BookmarkNode): void {
    map.set(node.id, node)
    if (node.children?.length) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  for (const root of nodes) {
    walk(root)
  }

  return map
}

function hasSelectedAncestor(id: string, selected: Set<string>, allNodes: Map<string, BookmarkNode>): boolean {
  let current = allNodes.get(id)
  while (current?.parentId) {
    if (selected.has(current.parentId)) {
      return true
    }
    current = allNodes.get(current.parentId)
  }
  return false
}

export function getDescendantFolderIds(folderId: string, allNodes: Map<string, BookmarkNode>): string[] {
  const current = allNodes.get(folderId)
  if (!current?.children?.length) {
    return []
  }

  const ids: string[] = []
  for (const child of current.children) {
    if (Array.isArray(child.children)) {
      ids.push(child.id)
      ids.push(...getDescendantFolderIds(child.id, allNodes))
    }
  }

  return ids
}

function buildSelectedFolderSubtree(node: BookmarkNode, selected: Set<string>): BookmarkNode | null {
  if (!selected.has(node.id)) {
    return null
  }

  const clonedChildren: BookmarkNode[] = []
  for (const child of node.children ?? []) {
    if (Array.isArray(child.children)) {
      if (selected.has(child.id)) {
        const childTree = buildSelectedFolderSubtree(child, selected)
        if (childTree) {
          clonedChildren.push(childTree)
        }
      }
    } else {
      clonedChildren.push(child)
    }
  }

  return {
    ...node,
    children: clonedChildren
  }
}

export function buildSelectedExportRoots(
  tree: BookmarkNode[],
  selectedFolderIds: string[],
  allNodes: Map<string, BookmarkNode>
): BookmarkNode[] {
  if (selectedFolderIds.length === 0) {
    return tree
  }

  const selected = new Set(selectedFolderIds)
  const topIds = [...selected].filter((id) => !hasSelectedAncestor(id, selected, allNodes))

  const roots: BookmarkNode[] = []
  for (const id of topIds) {
    const node = allNodes.get(id)
    if (node && Array.isArray(node.children)) {
      const selectedTree = buildSelectedFolderSubtree(node, selected)
      if (selectedTree) {
        roots.push(selectedTree)
      }
    }
  }
  return roots
}

export function countExportContent(nodes: BookmarkNode[]): { folders: number; links: number } {
  let folders = 0
  let links = 0

  const walk = (node: BookmarkNode): void => {
    if (Array.isArray(node.children)) {
      if (node.id !== "0") {
        folders += 1
      }
      for (const child of node.children) {
        walk(child)
      }
      return
    }

    if (node.url) {
      links += 1
    }
  }

  for (const node of nodes) {
    walk(node)
  }

  return { folders, links }
}

export function getDefaultImportParentId(tree: BookmarkNode[]): string {
  const root = tree[0]
  if (root?.children?.length) {
    const bar = root.children.find((n) => n.id === "1")
    if (bar) {
      return bar.id
    }
    return root.children[0].id
  }
  return "1"
}

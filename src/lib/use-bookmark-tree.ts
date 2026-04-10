import { useCallback, useEffect, useState } from "react"
import { getTree } from "./chrome-api"
import { buildFolderTree, flattenNodes } from "./bookmark-utils"
import type { BookmarkNode, FolderTreeNode } from "../types/bookmark"

export type UseBookmarkTreeResult = {
  tree: BookmarkNode[]
  folderTree: FolderTreeNode[]
  expandedFolderIds: string[]
  loadError: string
  setExpandedFolderIds: (ids: string[]) => void
  reloadTree: () => Promise<void>
}

/**
 * Custom hook for managing bookmark tree state and operations.
 * Handles loading tree data, building folder structure, and managing expanded state.
 */
export function useBookmarkTree(): UseBookmarkTreeResult {
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([])
  const [loadError, setLoadError] = useState("")

  const reloadTree = useCallback(async () => {
    try {
      const data = await getTree()
      setTree(data)
      const builtTree = buildFolderTree(data)
      setFolderTree(builtTree)
      setExpandedFolderIds(builtTree.map((item) => item.id))
      setLoadError("")
    } catch (error) {
      setLoadError((error as Error).message)
    }
  }, [])

  // Load tree on mount
  useEffect(() => {
    void reloadTree()
  }, [reloadTree])

  return {
    tree,
    folderTree,
    expandedFolderIds,
    loadError,
    setExpandedFolderIds,
    reloadTree
  }
}

import { useEffect, useMemo, useState } from "react"

import { buildSelectedExportRoots, flattenFolderTreeIds, flattenNodes, getDescendantFolderIds } from "./bookmark-utils"
import { getTree } from "./chrome-api"
import { loadCompareViewerState, saveCompareViewerState } from "./compare-viewer-state"
import { compareBookmarkSelections } from "./compare-utils"
import type { CompareResult } from "./compare-utils"
import type { BookmarkNode, FolderTreeNode } from "../types/bookmark"

type UseCompareSelectionOptions = {
  tree: BookmarkNode[]
  folderTree: FolderTreeNode[]
  expandedFolderIds: string[]
  setExpandedFolderIds: (ids: string[]) => void
  preloadFromSavedState?: boolean
}

type CompareSelectionTarget = "A" | "B"

type UseCompareSelectionResult = {
  compareSetA: string[]
  compareSetB: string[]
  compareResult: CompareResult | null
  compareSetACount: number
  compareSetBCount: number
  createdAt: number | null
  setCompareResult: (result: CompareResult | null) => void
  toggleExpanded: (id: string) => void
  toggleCompareSetFolder: (target: CompareSelectionTarget, id: string) => void
  selectAllCompareSet: (target: CompareSelectionTarget) => void
  clearCompareSet: (target: CompareSelectionTarget) => void
  runSelectionCompare: () => Promise<CompareResult>
  clearCompareState: () => void
}

export function useCompareSelection({
  tree,
  folderTree,
  expandedFolderIds,
  setExpandedFolderIds,
  preloadFromSavedState = false
}: UseCompareSelectionOptions): UseCompareSelectionResult {
  const [compareSetA, setCompareSetA] = useState<string[]>([])
  const [compareSetB, setCompareSetB] = useState<string[]>([])
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [compareSetACount, setCompareSetACount] = useState(0)
  const [compareSetBCount, setCompareSetBCount] = useState(0)
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const allNodes = useMemo(() => flattenNodes(tree), [tree])

  useEffect(() => {
    if (!preloadFromSavedState) {
      return
    }

    void (async () => {
      try {
        const state = await loadCompareViewerState()
        if (!state) {
          return
        }

        setCompareSetA(state.compareSetAIds ?? [])
        setCompareSetB(state.compareSetBIds ?? [])
        setCompareSetACount(state.compareSetACount)
        setCompareSetBCount(state.compareSetBCount)
        setCreatedAt(state.createdAt)
        setCompareResult(state.compareResult)
      } catch {
        // Ignore load failures. Users can still run a fresh compare.
      }
    })()
  }, [preloadFromSavedState])

  const toggleExpanded = (id: string): void => {
    setExpandedFolderIds(
      expandedFolderIds.includes(id)
        ? expandedFolderIds.filter((item) => item !== id)
        : [...expandedFolderIds, id]
    )
  }

  const toggleCompareSetFolder = (target: CompareSelectionTarget, id: string): void => {
    const setState = target === "A" ? setCompareSetA : setCompareSetB
    setState((prev) => {
      const next = new Set(prev)
      const cascadeIds = [id, ...getDescendantFolderIds(id, allNodes)]

      if (next.has(id)) {
        for (const targetId of cascadeIds) {
          next.delete(targetId)
        }
      } else {
        for (const targetId of cascadeIds) {
          next.add(targetId)
        }
      }

      return [...next]
    })
  }

  const selectAllCompareSet = (target: CompareSelectionTarget): void => {
    const allFolderIds = flattenFolderTreeIds(folderTree)
    if (target === "A") {
      setCompareSetA(allFolderIds)
      return
    }

    setCompareSetB(allFolderIds)
  }

  const clearCompareSet = (target: CompareSelectionTarget): void => {
    if (target === "A") {
      setCompareSetA([])
      return
    }

    setCompareSetB([])
  }

  const runSelectionCompare = async (): Promise<CompareResult> => {
    const latestTree = await getTree()
    const latestNodes = flattenNodes(latestTree)

    const rootsA = buildSelectedExportRoots(latestTree, compareSetA, latestNodes)
    const rootsB = buildSelectedExportRoots(latestTree, compareSetB, latestNodes)
    const result = compareBookmarkSelections(rootsA, rootsB)
    const now = Date.now()

    setCompareResult(result)
    setCompareSetACount(compareSetA.length)
    setCompareSetBCount(compareSetB.length)
    setCreatedAt(now)

    await saveCompareViewerState({
      compareResult: result,
      compareSetACount: compareSetA.length,
      compareSetBCount: compareSetB.length,
      createdAt: now,
      compareSetAIds: compareSetA,
      compareSetBIds: compareSetB
    })

    return result
  }

  const clearCompareState = (): void => {
    setCompareResult(null)
    setCompareSetACount(0)
    setCompareSetBCount(0)
    setCreatedAt(null)
  }

  return {
    compareSetA,
    compareSetB,
    compareResult,
    compareSetACount,
    compareSetBCount,
    createdAt,
    setCompareResult,
    toggleExpanded,
    toggleCompareSetFolder,
    selectAllCompareSet,
    clearCompareSet,
    runSelectionCompare,
    clearCompareState
  }
}

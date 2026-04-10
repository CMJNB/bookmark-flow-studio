import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { FolderTreeView } from "../components/FolderTreeView"
import { buildCompareViewerRows, compareBookmarkSelections } from "../lib/compare-utils"
import type { CompareResult, CompareStats, CompareViewerRow } from "../lib/compare-utils"
import { saveCompareViewerState } from "../lib/compare-viewer-state"
import { getTree, openPopupWindow } from "../lib/chrome-api"
import {
  buildFolderTree,
  buildSelectedExportRoots,
  flattenFolderTreeIds,
  flattenNodes,
  getDescendantFolderIds
} from "../lib/bookmark-utils"
import { applyTheme, defaultSettings, loadSettings } from "../lib/settings"
import { t, tf } from "../lib/i18n"
import type { BookmarkNode, FolderTreeNode } from "../types/bookmark"
import type { AppSettings } from "../types/settings"

type CompareFilter = "title-only" | "url-only" | "title-url-conflict"

function CompareViewerPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([])
  const [compareSetA, setCompareSetA] = useState<string[]>([])
  const [compareSetB, setCompareSetB] = useState<string[]>([])
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [rows, setRows] = useState<CompareViewerRow[]>([])
  const [compareSetACount, setCompareSetACount] = useState(0)
  const [compareSetBCount, setCompareSetBCount] = useState(0)
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null)
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState<CompareFilter>("title-only")
  const [loadError, setLoadError] = useState("")
  const allNodes = useMemo(() => flattenNodes(tree), [tree])

  useEffect(() => {
    ;(async () => {
      try {
        const loadedSettings = await loadSettings()
        setSettings(loadedSettings)
        applyTheme(loadedSettings.theme)

        const data = await getTree()
        setTree(data)
        const builtTree = buildFolderTree(data)
        setFolderTree(builtTree)
        setExpandedFolderIds(builtTree.map((item) => item.id))
      } catch (error) {
        setLoadError((error as Error).message)
      }
    })()
  }, [])

  useEffect(() => {
    const listener = (_changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") {
        return
      }

      void (async () => {
        const loadedSettings = await loadSettings()
        setSettings(loadedSettings)
        applyTheme(loadedSettings.theme)
      })()
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  useEffect(() => {
    if (settings.theme !== "system") {
      return undefined
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme("system")
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [settings.theme])

  const filteredRows = useMemo(() => rows.filter((row) => row.kind === filter), [filter, rows])

  const rowKindLabel = (row: CompareViewerRow): string => {
    if (row.kind === "title-only") {
      return t(settings.language, "compareTypeTitleOnly")
    }
    if (row.kind === "url-only") {
      return t(settings.language, "compareTypeUrlOnly")
    }
    return t(settings.language, "compareTypeConflict")
  }

  const openSearchPage = async (): Promise<void> => {
    if (!compareResult) {
      return
    }

    try {
      await openPopupWindow(chrome.runtime.getURL("tabs/compare-search.html"), 1040, 760)
    } catch {
      // Ignore because user still has in-page compare view.
    }
  }

  const toggleExpanded = (id: string): void => {
    setExpandedFolderIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleCompareSetFolder = (target: "A" | "B", id: string): void => {
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

  const selectAllCompareSet = (target: "A" | "B"): void => {
    const allFolderIds = flattenFolderTreeIds(folderTree)
    if (target === "A") {
      setCompareSetA(allFolderIds)
      return
    }
    setCompareSetB(allFolderIds)
  }

  const clearCompareSet = (target: "A" | "B"): void => {
    if (target === "A") {
      setCompareSetA([])
      return
    }
    setCompareSetB([])
  }

  const runSelectionCompare = async (): Promise<void> => {
    const rootsA = buildSelectedExportRoots(tree, compareSetA, allNodes)
    const rootsB = buildSelectedExportRoots(tree, compareSetB, allNodes)
    const result = compareBookmarkSelections(rootsA, rootsB)

    setCompareResult(result)
    setRows(buildCompareViewerRows(result))
    setCompareStats(result.stats)
    setCompareSetACount(compareSetA.length)
    setCompareSetBCount(compareSetB.length)
    setCreatedAt(Date.now())

    await saveCompareViewerState({
      compareResult: result,
      compareSetACount: compareSetA.length,
      compareSetBCount: compareSetB.length,
      createdAt: Date.now()
    })
  }

  const clearCompare = (): void => {
    setCompareResult(null)
    setRows([])
    setCompareStats(null)
    setCreatedAt(null)
  }

  return (
    <main className="compare-viewer-app">
      <header className="compare-viewer-header">
        <div>
          <h1>{t(settings.language, "floatingCompareTitle")}</h1>
          <p>{t(settings.language, "floatingCompareHint")}</p>
        </div>
        <div className="compare-viewer-meta">
          <div>{tf(settings.language, "floatingCompareSetCount", { a: compareSetACount, b: compareSetBCount })}</div>
          {createdAt ? <div>{tf(settings.language, "floatingCompareGeneratedAt", { time: new Date(createdAt).toLocaleString(settings.language) })}</div> : null}
        </div>
      </header>

      <section className="compare-viewer-toolbar">
        <button className={`page-btn ${filter === "title-only" ? "active" : ""}`} onClick={() => setFilter("title-only")}>{t(settings.language, "floatingCompareFilterTitleOnly")}</button>
        <button className={`page-btn ${filter === "url-only" ? "active" : ""}`} onClick={() => setFilter("url-only")}>{t(settings.language, "floatingCompareFilterUrlOnly")}</button>
        <button className={`page-btn ${filter === "title-url-conflict" ? "active" : ""}`} onClick={() => setFilter("title-url-conflict")}>{t(settings.language, "floatingCompareFilterConflict")}</button>
        <button className="page-btn" onClick={() => void runSelectionCompare()}>{t(settings.language, "runCompare")}</button>
        <button className="page-btn" onClick={() => void openSearchPage()}>{t(settings.language, "floatingCompareOpenSearchPage")}</button>
        <button className="page-btn" onClick={clearCompare}>{t(settings.language, "clearCompare")}</button>
      </section>

      <section className="compare-set-editor-grid">
        <div className="compare-set-editor">
          <div className="compare-viewer-column-title">{t(settings.language, "compareSetAEditor")}</div>
          <div className="folder-list">
            <FolderTreeView
              nodes={folderTree}
              expandedFolderIds={expandedFolderIds}
              selectedFolderIds={compareSetA}
              onToggleExpanded={toggleExpanded}
              onToggleSelected={(id) => toggleCompareSetFolder("A", id)}
            />
          </div>
          <div className="controls">
            <button className="page-btn" onClick={() => selectAllCompareSet("A")}>{t(settings.language, "compareSetSelectAll")}</button>
            <button className="page-btn" onClick={() => clearCompareSet("A")}>{t(settings.language, "compareSetClear")}</button>
          </div>
        </div>

        <div className="compare-set-editor">
          <div className="compare-viewer-column-title">{t(settings.language, "compareSetBEditor")}</div>
          <div className="folder-list">
            <FolderTreeView
              nodes={folderTree}
              expandedFolderIds={expandedFolderIds}
              selectedFolderIds={compareSetB}
              onToggleExpanded={toggleExpanded}
              onToggleSelected={(id) => toggleCompareSetFolder("B", id)}
            />
          </div>
          <div className="controls">
            <button className="page-btn" onClick={() => selectAllCompareSet("B")}>{t(settings.language, "compareSetSelectAll")}</button>
            <button className="page-btn" onClick={() => clearCompareSet("B")}>{t(settings.language, "compareSetClear")}</button>
          </div>
        </div>
      </section>

      {compareStats ? (
        <section className="compare-viewer-stats-grid">
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatAEntries")}: {compareStats.aEntryCount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatBEntries")}: {compareStats.bEntryCount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatTitleOnlyA")}: {compareStats.titleOnlyACount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatTitleOnlyB")}: {compareStats.titleOnlyBCount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatUrlOnlyA")}: {compareStats.urlOnlyACount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatUrlOnlyB")}: {compareStats.urlOnlyBCount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatTitleBoth")}: {compareStats.titleBothCount}</div>
          <div className="compare-viewer-stat-item">{t(settings.language, "compareStatUrlBoth")}: {compareStats.urlBothCount}</div>
          <div className="compare-viewer-stat-item wide">{t(settings.language, "compareStatConflict")}: {compareStats.sameTitleDifferentUrlCount}</div>
        </section>
      ) : null}

      {loadError ? <section className="compare-viewer-empty">{tf(settings.language, "floatingCompareOpenFailed", { error: loadError })}</section> : null}

      {!loadError && !compareResult ? <section className="compare-viewer-empty">{t(settings.language, "floatingCompareNoData")}</section> : null}

      {!loadError && compareResult && filteredRows.length === 0 ? <section className="compare-viewer-empty">{t(settings.language, "floatingCompareNoFilteredRows")}</section> : null}

      {!loadError && filteredRows.length > 0 ? (
        <section className="compare-viewer-grid">
          {filteredRows.map((row) => (
            <article key={row.id} className="compare-viewer-row-card">
              <div className="compare-viewer-row-head">
                <span className="compare-viewer-kind">{rowKindLabel(row)}</span>
                <h2>{row.label || t(settings.language, "emptyTitle")}</h2>
              </div>

              <div className="compare-viewer-columns">
                <div className="compare-viewer-column">
                  <div className="compare-viewer-column-title">{t(settings.language, "floatingCompareColumnA")}</div>
                  {row.leftItems.length ? (
                    <ul className="compare-viewer-entry-list">
                      {row.leftItems.map((item, index) => (
                        <li key={`left-${row.id}-${item.url}-${item.path}-${index}`}>
                          <div className="compare-viewer-entry-title">{item.title || t(settings.language, "emptyTitle")}</div>
                          <div className="compare-viewer-entry-sub">URL: {item.url}</div>
                          <div className="compare-viewer-entry-sub">{t(settings.language, "sourcePath")}: {item.path || t(settings.language, "rootPath")}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
                  )}
                </div>

                <div className="compare-viewer-column">
                  <div className="compare-viewer-column-title">{t(settings.language, "floatingCompareColumnB")}</div>
                  {row.rightItems.length ? (
                    <ul className="compare-viewer-entry-list">
                      {row.rightItems.map((item, index) => (
                        <li key={`right-${row.id}-${item.url}-${item.path}-${index}`}>
                          <div className="compare-viewer-entry-title">{item.title || t(settings.language, "emptyTitle")}</div>
                          <div className="compare-viewer-entry-sub">URL: {item.url}</div>
                          <div className="compare-viewer-entry-sub">{t(settings.language, "sourcePath")}: {item.path || t(settings.language, "rootPath")}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  )
}

export default CompareViewerPage
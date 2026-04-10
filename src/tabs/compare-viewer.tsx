import { useMemo, useState } from "react"

import "./compare-viewer.css"
import { CompareEntryList } from "../components/CompareEntryList"
import { CompareSetEditor } from "../components/CompareSetEditor"
import { PageHeader } from "../components/PageHeader"
import { TabButton } from "../components/TabButton"
import { EmptyState } from "../components/EmptyState"
import { OptionSelector } from "../components/OptionSelector"
import { buildCompareViewerRows, compareBookmarkSelections } from "../lib/compare-utils"
import type { CompareResult, CompareStats, CompareViewerRow } from "../lib/compare-utils"
import { saveCompareViewerState } from "../lib/compare-viewer-state"
import { getTree, openPopupWindow } from "../lib/chrome-api"
import {
  buildSelectedExportRoots,
  flattenFolderTreeIds,
  flattenNodes,
  getDescendantFolderIds
} from "../lib/bookmark-utils"
import { useAppSettings } from "../lib/use-app-settings"
import { useBookmarkTree } from "../lib/use-bookmark-tree"
import { t, tf } from "../lib/i18n"
import type { FolderTreeNode } from "../types/bookmark"

type CompareFilter = "title-only" | "url-only" | "url-title-change" | "title-url-conflict"

type RowSortBy = "original" | "label-asc" | "label-desc" | "url-asc" | "url-desc" | "count-asc" | "count-desc"

function sortViewerRows(rows: CompareViewerRow[], sortBy: RowSortBy): CompareViewerRow[] {
  const sorted = [...rows]
  switch (sortBy) {
    case "label-asc":
      sorted.sort((a, b) => (a.label || "").localeCompare(b.label || "", "zh-CN"))
      break
    case "label-desc":
      sorted.sort((a, b) => (b.label || "").localeCompare(a.label || "", "zh-CN"))
      break
    case "url-asc":
      sorted.sort((a, b) => {
        const aUrl = (a.leftItems[0]?.url || a.rightItems[0]?.url) || ""
        const bUrl = (b.leftItems[0]?.url || b.rightItems[0]?.url) || ""
        return aUrl.localeCompare(bUrl, "zh-CN")
      })
      break
    case "url-desc":
      sorted.sort((a, b) => {
        const aUrl = (a.leftItems[0]?.url || a.rightItems[0]?.url) || ""
        const bUrl = (b.leftItems[0]?.url || b.rightItems[0]?.url) || ""
        return bUrl.localeCompare(aUrl, "zh-CN")
      })
      break
    case "count-asc":
      sorted.sort((a, b) => (a.leftItems.length + a.rightItems.length) - (b.leftItems.length + b.rightItems.length))
      break
    case "count-desc":
      sorted.sort((a, b) => (b.leftItems.length + b.rightItems.length) - (a.leftItems.length + a.rightItems.length))
      break
    case "original":
    default:
      break
  }
  return sorted
}

function CompareViewerPage() {
  const settings = useAppSettings()
  const { tree, folderTree, expandedFolderIds, setExpandedFolderIds, loadError } = useBookmarkTree()
  const [compareSetA, setCompareSetA] = useState<string[]>([])
  const [compareSetB, setCompareSetB] = useState<string[]>([])
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [rows, setRows] = useState<CompareViewerRow[]>([])
  const [compareSetACount, setCompareSetACount] = useState(0)
  const [compareSetBCount, setCompareSetBCount] = useState(0)
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null)
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState<CompareFilter>("title-only")
  const [rowSortBy, setRowSortBy] = useState<RowSortBy>("original")
  const [actionStatus, setActionStatus] = useState("")
  const allNodes = useMemo(() => flattenNodes(tree), [tree])

  const filteredRows = useMemo(() => sortViewerRows(rows.filter((row) => row.kind === filter), rowSortBy), [filter, rows, rowSortBy])

  const rowKindLabel = (row: CompareViewerRow): string => {
    if (row.kind === "title-only") {
      return t(settings.language, "compareTypeTitleOnly")
    }
    if (row.kind === "url-only") {
      return t(settings.language, "compareTypeUrlOnly")
    }
    if (row.kind === "url-title-change") {
      return t(settings.language, "compareTypeUrlTitleChange")
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
    setExpandedFolderIds(
      expandedFolderIds.includes(id)
        ? expandedFolderIds.filter((item) => item !== id)
        : [...expandedFolderIds, id]
    )
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
    try {
      const latestTree = await getTree()
      const latestNodes = flattenNodes(latestTree)

      const rootsA = buildSelectedExportRoots(latestTree, compareSetA, latestNodes)
      const rootsB = buildSelectedExportRoots(latestTree, compareSetB, latestNodes)
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
        createdAt: Date.now(),
        compareSetAIds: compareSetA,
        compareSetBIds: compareSetB
      })
    } catch (error) {
      setActionStatus((error as Error).message)
    }
  }

  const clearCompare = (): void => {
    setCompareResult(null)
    setRows([])
    setCompareStats(null)
    setCreatedAt(null)
    setActionStatus("")
  }

  return (
    <main className="compare-viewer-app">
      <PageHeader
        title={t(settings.language, "floatingCompareTitle")}
        subtitle={t(settings.language, "floatingCompareHint")}
        meta={
          <>
            <div>{tf(settings.language, "floatingCompareSetCount", { a: compareSetACount, b: compareSetBCount })}</div>
            {createdAt ? <div>{tf(settings.language, "floatingCompareGeneratedAt", { time: new Date(createdAt).toLocaleString(settings.language) })}</div> : null}
          </>
        }
      />

      <section className="compare-viewer-toolbar">
        <TabButton isActive={filter === "title-only"} onClick={() => setFilter("title-only")}>
          {t(settings.language, "floatingCompareFilterTitleOnly")}
        </TabButton>
        <TabButton isActive={filter === "url-only"} onClick={() => setFilter("url-only")}>
          {t(settings.language, "floatingCompareFilterUrlOnly")}
        </TabButton>
        <TabButton isActive={filter === "url-title-change"} onClick={() => setFilter("url-title-change")}>
          {t(settings.language, "floatingCompareFilterUrlTitleChange")}
        </TabButton>
        <TabButton isActive={filter === "title-url-conflict"} onClick={() => setFilter("title-url-conflict")}>
          {t(settings.language, "floatingCompareFilterConflict")}
        </TabButton>
        <button className="page-btn" onClick={() => void runSelectionCompare()}>{t(settings.language, "runCompare")}</button>
        <button className="page-btn" onClick={() => void openSearchPage()}>{t(settings.language, "floatingCompareOpenSearchPage")}</button>
        <button className="page-btn" onClick={clearCompare}>{t(settings.language, "clearCompare")}</button>
      </section>

      {!loadError && compareResult ? (
        <OptionSelector
          label={t(settings.language, "floatingCompareRowSortLabel")}
          options={[
            { value: "original", label: t(settings.language, "floatingCompareSortOriginal"), title: t(settings.language, "floatingCompareRowSortOriginalTitle") },
            { value: "label-asc", label: t(settings.language, "floatingCompareSortLabelAsc"), title: t(settings.language, "floatingCompareSortLabelAscTitle") },
            { value: "label-desc", label: t(settings.language, "floatingCompareSortLabelDesc"), title: t(settings.language, "floatingCompareSortLabelDescTitle") },
            { value: "url-asc", label: t(settings.language, "floatingCompareSortUrlAsc"), title: t(settings.language, "floatingCompareSortLabelUrlAscTitle") },
            { value: "url-desc", label: t(settings.language, "floatingCompareSortUrlDesc"), title: t(settings.language, "floatingCompareSortLabelUrlDescTitle") },
            { value: "count-asc", label: t(settings.language, "floatingCompareSortCountAsc"), title: t(settings.language, "floatingCompareSortCountAscTitle") },
            { value: "count-desc", label: t(settings.language, "floatingCompareSortCountDesc"), title: t(settings.language, "floatingCompareSortCountDescTitle") }
          ]}
          value={rowSortBy}
          onChange={setRowSortBy}
        />
      ) : null}

      {actionStatus ? <section className="compare-viewer-inline-status">{actionStatus}</section> : null}

      <section className="compare-set-editor-grid">
        <CompareSetEditor
          language={settings.language}
          title={t(settings.language, "compareSetAEditor")}
          nodes={folderTree}
          expandedFolderIds={expandedFolderIds}
          selectedFolderIds={compareSetA}
          onToggleExpanded={toggleExpanded}
          onToggleSelected={(id) => toggleCompareSetFolder("A", id)}
          onSelectAll={() => selectAllCompareSet("A")}
          onClear={() => clearCompareSet("A")}
        />

        <CompareSetEditor
          language={settings.language}
          title={t(settings.language, "compareSetBEditor")}
          nodes={folderTree}
          expandedFolderIds={expandedFolderIds}
          selectedFolderIds={compareSetB}
          onToggleExpanded={toggleExpanded}
          onToggleSelected={(id) => toggleCompareSetFolder("B", id)}
          onSelectAll={() => selectAllCompareSet("B")}
          onClear={() => clearCompareSet("B")}
        />
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
          <div className="compare-viewer-stat-item wide">{t(settings.language, "compareStatUrlTitleChange")}: {compareStats.sameUrlDifferentTitleCount}</div>
          <div className="compare-viewer-stat-item wide">{t(settings.language, "compareStatConflict")}: {compareStats.sameTitleDifferentUrlCount}</div>
        </section>
      ) : null}

      {loadError ? (
        <EmptyState message={tf(settings.language, "floatingCompareOpenFailed", { error: loadError })} icon="❌" />
      ) : null}

      {!loadError && !compareResult ? (
        <EmptyState message={t(settings.language, "floatingCompareNoData")} icon="📭" />
      ) : null}

      {!loadError && compareResult && filteredRows.length === 0 ? (
        <EmptyState message={t(settings.language, "floatingCompareNoFilteredRows")} icon="🔍" />
      ) : null}

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
                    <CompareEntryList
                      entries={row.leftItems}
                      language={settings.language}
                      sideKey="left"
                      rowKey={row.id}
                      onStatusChange={setActionStatus}
                    />
                  ) : (
                    <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
                  )}
                </div>

                <div className="compare-viewer-column">
                  <div className="compare-viewer-column-title">{t(settings.language, "floatingCompareColumnB")}</div>
                  {row.rightItems.length ? (
                    <CompareEntryList
                      entries={row.rightItems}
                      language={settings.language}
                      sideKey="right"
                      rowKey={row.id}
                      onStatusChange={setActionStatus}
                    />
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
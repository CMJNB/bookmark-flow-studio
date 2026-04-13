import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { CompareSetEditor } from "../components/CompareSetEditor"
import { EmptyState } from "../components/EmptyState"
import { PageHeader } from "../components/PageHeader"
import { buildRepairCandidates, buildRepairedEntriesFromSelection, normalizeRepairSourceSelection } from "../lib/compare-utils"
import type { RepairCandidate } from "../lib/compare-utils"
import { downloadTextFile } from "../lib/chrome-api"
import { buildHtmlTreeFromEntries, bookmarkTreeToHtml } from "../lib/bookmark-html"
import { formatDateForFileName } from "../lib/format"
import { t, tf } from "../lib/i18n"
import { useAppSettings } from "../lib/use-app-settings"
import { useBookmarkTree } from "../lib/use-bookmark-tree"
import { useCompareSelection } from "../lib/use-compare-selection"

function CompareRepairPage() {
  const settings = useAppSettings()
  const { tree, folderTree, expandedFolderIds, setExpandedFolderIds, loadError } = useBookmarkTree()
  const {
    compareSetA,
    compareSetB,
    compareResult,
    compareSetACount,
    compareSetBCount,
    createdAt,
    toggleExpanded,
    toggleCompareSetFolder,
    selectAllCompareSet,
    clearCompareSet,
    runSelectionCompare: runSharedCompare
  } = useCompareSelection({
    tree,
    folderTree,
    expandedFolderIds,
    setExpandedFolderIds,
    preloadFromSavedState: true
  })
  const [actionStatus, setActionStatus] = useState("")
  const [selectedRepairSourceIds, setSelectedRepairSourceIds] = useState<Record<string, string>>({})

  const repairCandidates = useMemo<RepairCandidate[]>(() => {
    if (!compareResult) {
      return []
    }

    return buildRepairCandidates(compareResult)
  }, [compareResult])

  const ambiguousRepairCandidates = useMemo(
    () => repairCandidates.filter((candidate) => candidate.aEntries.length > 1),
    [repairCandidates]
  )

  const repairBookmarkCount = useMemo(
    () => repairCandidates.reduce((sum, candidate) => sum + candidate.bEntries.length, 0),
    [repairCandidates]
  )

  useEffect(() => {
    setSelectedRepairSourceIds((prev) => normalizeRepairSourceSelection(repairCandidates, prev))
  }, [repairCandidates])

  const runSelectionCompareWithStatus = async (): Promise<void> => {
    try {
      await runSharedCompare()
      setActionStatus("")
    } catch (error) {
      setActionStatus((error as Error).message)
    }
  }

  const exportRepairHtml = async (): Promise<void> => {
    if (repairCandidates.length === 0 || !compareResult) {
      setActionStatus(t(settings.language, "floatingCompareRepairNoCandidate"))
      return
    }

    try {
      const repairedEntries = buildRepairedEntriesFromSelection(compareResult.allEntriesB, repairCandidates, selectedRepairSourceIds)

      const stamp = formatDateForFileName(new Date())
      const folderTitle = `${t(settings.language, "floatingCompareRepairFolderPrefix")} ${stamp}`
      const html = bookmarkTreeToHtml(
        [
          {
            title: folderTitle,
            dateGroupModified: Date.now(),
            children: buildHtmlTreeFromEntries(repairedEntries)
          }
        ],
        folderTitle
      )
      const fileName = `bookmarks-repair-${stamp}.html`

      await downloadTextFile(fileName, html, "text/html;charset=utf-8")
      setActionStatus(
        tf(settings.language, "floatingCompareRepairExported", {
          fileName,
          urls: repairCandidates.length,
          count: repairedEntries.length
        })
      )
    } catch (error) {
      setActionStatus(
        tf(settings.language, "floatingCompareRepairExportFailed", {
          error: (error as Error).message
        })
      )
    }
  }

  return (
    <main className="compare-viewer-app">
      <PageHeader
        title={t(settings.language, "floatingCompareRepairPageTitle")}
        subtitle={t(settings.language, "floatingCompareRepairPageHint")}
        meta={
          <>
            <div>{tf(settings.language, "floatingCompareSetCount", { a: compareSetACount, b: compareSetBCount })}</div>
            {createdAt ? <div>{tf(settings.language, "floatingCompareGeneratedAt", { time: new Date(createdAt).toLocaleString(settings.language) })}</div> : null}
          </>
        }
      />

      <section className="compare-viewer-toolbar">
        <button className="page-btn" onClick={() => void runSelectionCompareWithStatus()}>{t(settings.language, "runCompare")}</button>
        <button className="page-btn" onClick={() => void exportRepairHtml()}>{t(settings.language, "floatingCompareRepairExport")}</button>
      </section>

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

      {loadError ? (
        <EmptyState message={tf(settings.language, "floatingCompareOpenFailed", { error: loadError })} icon="❌" />
      ) : null}

      {!loadError && !compareResult ? (
        <EmptyState message={t(settings.language, "floatingCompareRepairStandaloneEmpty")} icon="🛠️" />
      ) : null}

      {!loadError && compareResult ? (
        <section className="compare-viewer-repair-panel">
          <div className="compare-viewer-repair-head">
            <div>
              <h2>{t(settings.language, "floatingCompareRepairTitle")}</h2>
              <p>{t(settings.language, "floatingCompareRepairHint")}</p>
            </div>
          </div>

          <div className="compare-viewer-repair-stats">
            <div className="compare-viewer-stat-item">{t(settings.language, "floatingCompareRepairUrlCount")}: {repairCandidates.length}</div>
            <div className="compare-viewer-stat-item">{t(settings.language, "floatingCompareRepairBookmarkCount")}: {repairBookmarkCount}</div>
            <div className="compare-viewer-stat-item">{t(settings.language, "floatingCompareRepairConflictCount")}: {ambiguousRepairCandidates.length}</div>
          </div>

          <div className="compare-viewer-repair-note">{t(settings.language, "floatingCompareRepairNotice")}</div>

          {ambiguousRepairCandidates.length > 0 ? (
            <div className="compare-viewer-repair-choice-list">
              {ambiguousRepairCandidates.map((candidate) => (
                <article key={candidate.id} className="compare-viewer-repair-choice-card">
                  <div className="compare-viewer-repair-choice-head">
                    <h3>{candidate.url}</h3>
                    <div className="compare-viewer-entry-sub">
                      {tf(settings.language, "floatingCompareRepairTargetCount", { count: candidate.bEntries.length })}
                    </div>
                  </div>

                  <div className="compare-viewer-repair-targets">
                    {candidate.bEntries.map((entry, index) => (
                      <div key={`${candidate.id}-target-${entry.id}-${index}`} className="compare-viewer-repair-target-block">
                        <div className="compare-viewer-entry-sub">
                          {t(settings.language, "floatingCompareRepairTarget")}: {entry.title || t(settings.language, "emptyTitle")} · {entry.path || t(settings.language, "rootPath")}{entry.dateAdded ? ` · ${t(settings.language, "dateAdded")}: ${new Date(entry.dateAdded).toLocaleString(settings.language)}` : ""}
                        </div>
                        <div className="compare-viewer-repair-options">
                          {candidate.aEntries.map((sourceEntry, sourceIndex) => {
                            const inputId = `${candidate.id}-${entry.id}-${sourceEntry.id}-${sourceIndex}`
                            const timeLabel = sourceEntry.dateAdded
                              ? new Date(sourceEntry.dateAdded).toLocaleString(settings.language)
                              : t(settings.language, "none")

                            return (
                              <label key={inputId} className="compare-viewer-repair-option" htmlFor={inputId}>
                                <input
                                  id={inputId}
                                  type="radio"
                                  name={`${candidate.id}-${entry.id}`}
                                  checked={selectedRepairSourceIds[entry.id] === sourceEntry.id}
                                  onChange={() =>
                                    setSelectedRepairSourceIds((prev) => ({
                                      ...prev,
                                      [entry.id]: sourceEntry.id
                                    }))
                                  }
                                />
                                <span>
                                  {sourceEntry.title || t(settings.language, "emptyTitle")} · {sourceEntry.path || t(settings.language, "rootPath")} · {timeLabel}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="compare-viewer-repair-note">{t(settings.language, "floatingCompareRepairNoConflict")}</div>
          )}
        </section>
      ) : null}
    </main>
  )
}

export default CompareRepairPage
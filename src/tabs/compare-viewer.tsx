import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { buildCompareViewerRows } from "../lib/compare-utils"
import type { CompareViewerRow } from "../lib/compare-utils"
import { loadCompareViewerState } from "../lib/compare-viewer-state"
import type { CompareStats } from "../lib/compare-utils"
import { openPopupWindow } from "../lib/chrome-api"
import { applyTheme, defaultSettings, loadSettings } from "../lib/settings"
import { t, tf } from "../lib/i18n"
import type { AppSettings } from "../types/settings"

type CompareFilter = "title-only" | "url-only" | "title-url-conflict"

function CompareViewerPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [rows, setRows] = useState<CompareViewerRow[]>([])
  const [compareSetACount, setCompareSetACount] = useState(0)
  const [compareSetBCount, setCompareSetBCount] = useState(0)
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null)
  const [createdAt, setCreatedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState<CompareFilter>("title-only")
  const [searchA, setSearchA] = useState("")
  const [searchB, setSearchB] = useState("")
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        const loadedSettings = await loadSettings()
        setSettings(loadedSettings)
        applyTheme(loadedSettings.theme)

        const state = await loadCompareViewerState()
        if (!state) {
          return
        }

        setCompareSetACount(state.compareSetACount)
        setCompareSetBCount(state.compareSetBCount)
        setCompareStats(state.compareResult.stats)
        setCreatedAt(state.createdAt)
        setRows(buildCompareViewerRows(state.compareResult))
      } catch (error) {
        setLoadError((error as Error).message)
      }
    })()
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

  const filteredRows = useMemo(() => {
    const scopedRows = rows.filter((row) => row.kind === filter)
    const normalizedSearchA = searchA.trim().toLowerCase()
    const normalizedSearchB = searchB.trim().toLowerCase()

    if (!normalizedSearchA && !normalizedSearchB) {
      return scopedRows
    }

    const matchesEntries = (items: CompareViewerRow["leftItems"], query: string): boolean => {
      if (!query) {
        return true
      }

      return items.some((item) => `${item.title} ${item.url} ${item.path}`.toLowerCase().includes(query))
    }

    return scopedRows.filter((row) => matchesEntries(row.leftItems, normalizedSearchA) && matchesEntries(row.rightItems, normalizedSearchB))
  }, [filter, rows, searchA, searchB])

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
    try {
      await openPopupWindow(chrome.runtime.getURL("tabs/compare-search.html"), 1040, 760)
    } catch {
      // Ignore because user still has in-page compare view.
    }
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
        <button className="page-btn" onClick={() => void openSearchPage()}>{t(settings.language, "floatingCompareOpenSearchPage")}</button>
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

      <section className="compare-viewer-search-grid">
        <div className="compare-viewer-search-wrap">
          <input
            className="compare-viewer-search-input with-clear"
            value={searchA}
            onChange={(event) => setSearchA(event.target.value)}
            placeholder={t(settings.language, "floatingCompareSearchA")}
          />
          {searchA ? (
            <button className="search-clear-btn" onClick={() => setSearchA("")} aria-label={t(settings.language, "floatingCompareClearSearchA")}>
              ×
            </button>
          ) : null}
        </div>
        <div className="compare-viewer-search-wrap">
          <input
            className="compare-viewer-search-input with-clear"
            value={searchB}
            onChange={(event) => setSearchB(event.target.value)}
            placeholder={t(settings.language, "floatingCompareSearchB")}
          />
          {searchB ? (
            <button className="search-clear-btn" onClick={() => setSearchB("")} aria-label={t(settings.language, "floatingCompareClearSearchB")}>
              ×
            </button>
          ) : null}
        </div>
      </section>

      {loadError ? <section className="compare-viewer-empty">{tf(settings.language, "floatingCompareOpenFailed", { error: loadError })}</section> : null}

      {!loadError && rows.length === 0 ? <section className="compare-viewer-empty">{t(settings.language, "floatingCompareEmpty")}</section> : null}

      {!loadError && rows.length > 0 && filteredRows.length === 0 ? <section className="compare-viewer-empty">{t(settings.language, "floatingCompareNoFilteredRows")}</section> : null}

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
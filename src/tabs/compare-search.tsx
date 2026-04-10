import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { loadCompareViewerState } from "../lib/compare-viewer-state"
import { applyTheme, defaultSettings, loadSettings } from "../lib/settings"
import { t, tf } from "../lib/i18n"
import type { BookmarkEntry } from "../types/bookmark"
import type { AppSettings } from "../types/settings"

function CompareSearchPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [keyword, setKeyword] = useState("")
  const [entriesA, setEntriesA] = useState<BookmarkEntry[]>([])
  const [entriesB, setEntriesB] = useState<BookmarkEntry[]>([])
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

        setEntriesA(state.compareResult.allEntriesA)
        setEntriesB(state.compareResult.allEntriesB)
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

        const state = await loadCompareViewerState()
        if (!state) {
          return
        }

        setEntriesA(state.compareResult.allEntriesA)
        setEntriesB(state.compareResult.allEntriesB)
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

  const normalizedKeyword = keyword.trim().toLowerCase()

  const matchEntry = (entry: BookmarkEntry): boolean => {
    if (!normalizedKeyword) {
      return true
    }

    return `${entry.title} ${entry.url} ${entry.path}`.toLowerCase().includes(normalizedKeyword)
  }

  const filteredA = useMemo(() => entriesA.filter(matchEntry), [entriesA, normalizedKeyword])
  const filteredB = useMemo(() => entriesB.filter(matchEntry), [entriesB, normalizedKeyword])

  return (
    <main className="compare-viewer-app">
      <header className="compare-viewer-header">
        <div>
          <h1>{t(settings.language, "floatingCompareSearchPageTitle")}</h1>
          <p>{t(settings.language, "floatingCompareSearchPageHint")}</p>
        </div>
        <div className="compare-viewer-meta">
          <div>{tf(settings.language, "floatingCompareSearchResultCount", { a: filteredA.length, b: filteredB.length })}</div>
        </div>
      </header>

      <section className="compare-viewer-search-grid one-column">
        <div className="compare-viewer-search-wrap">
          <input
            className="compare-viewer-search-input with-clear"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t(settings.language, "floatingCompareSearchKeyword")}
          />
          {keyword ? (
            <button className="search-clear-btn" onClick={() => setKeyword("")} aria-label={t(settings.language, "clearSearch")}>
              ×
            </button>
          ) : null}
        </div>
      </section>

      {loadError ? <section className="compare-viewer-empty">{loadError}</section> : null}

      {!loadError && entriesA.length === 0 && entriesB.length === 0 ? (
        <section className="compare-viewer-empty">{t(settings.language, "floatingCompareEmpty")}</section>
      ) : null}

      {!loadError && entriesA.length + entriesB.length > 0 && filteredA.length + filteredB.length === 0 ? (
        <section className="compare-viewer-empty">{t(settings.language, "floatingCompareSearchNoResult")}</section>
      ) : null}

      {!loadError && filteredA.length + filteredB.length > 0 ? (
        <section className="compare-viewer-search-columns">
          <article className="compare-viewer-row-card">
            <div className="compare-viewer-row-head">
              <h2>{t(settings.language, "floatingCompareColumnA")}</h2>
            </div>
            {filteredA.length ? (
              <ul className="compare-viewer-entry-list">
                {filteredA.map((entry, index) => (
                  <li key={`a-${entry.url}-${entry.path}-${index}`}>
                    <div className="compare-viewer-entry-title">{entry.title || t(settings.language, "emptyTitle")}</div>
                    <div className="compare-viewer-entry-sub">URL: {entry.url}</div>
                    <div className="compare-viewer-entry-sub">{t(settings.language, "sourcePath")}: {entry.path || t(settings.language, "rootPath")}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
            )}
          </article>

          <article className="compare-viewer-row-card">
            <div className="compare-viewer-row-head">
              <h2>{t(settings.language, "floatingCompareColumnB")}</h2>
            </div>
            {filteredB.length ? (
              <ul className="compare-viewer-entry-list">
                {filteredB.map((entry, index) => (
                  <li key={`b-${entry.url}-${entry.path}-${index}`}>
                    <div className="compare-viewer-entry-title">{entry.title || t(settings.language, "emptyTitle")}</div>
                    <div className="compare-viewer-entry-sub">URL: {entry.url}</div>
                    <div className="compare-viewer-entry-sub">{t(settings.language, "sourcePath")}: {entry.path || t(settings.language, "rootPath")}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
            )}
          </article>
        </section>
      ) : null}
    </main>
  )
}

export default CompareSearchPage
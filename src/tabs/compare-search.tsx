import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { CompareEntryList } from "../components/CompareEntryList"
import { PageHeader } from "../components/PageHeader"
import { SearchInput } from "../components/SearchInput"
import { EmptyState } from "../components/EmptyState"
import { loadCompareViewerState } from "../lib/compare-viewer-state"
import { useAppSettings } from "../lib/use-app-settings"
import { useStorageListener } from "../lib/use-storage-listener"
import { t, tf } from "../lib/i18n"
import type { BookmarkEntry } from "../types/bookmark"

function CompareSearchPage() {
  const settings = useAppSettings()
  const [keyword, setKeyword] = useState("")
  const [entriesA, setEntriesA] = useState<BookmarkEntry[]>([])
  const [entriesB, setEntriesB] = useState<BookmarkEntry[]>([])
  const [loadError, setLoadError] = useState("")
  const [actionStatus, setActionStatus] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
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

  useStorageListener(async () => {
    const state = await loadCompareViewerState()
    if (!state) {
      return
    }

    setEntriesA(state.compareResult.allEntriesA)
    setEntriesB(state.compareResult.allEntriesB)
  })

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
      <PageHeader
        title={t(settings.language, "floatingCompareSearchPageTitle")}
        subtitle={t(settings.language, "floatingCompareSearchPageHint")}
        meta={
          <div>{tf(settings.language, "floatingCompareSearchResultCount", { a: filteredA.length, b: filteredB.length })}</div>
        }
      />

      <section className="compare-viewer-search-grid one-column">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder={t(settings.language, "floatingCompareSearchKeyword")}
          language={settings.language}
        />
      </section>

      {actionStatus ? <section className="compare-viewer-inline-status">{actionStatus}</section> : null}

      {loadError ? (
        <EmptyState message={loadError} icon="❌" />
      ) : null}

      {!loadError && entriesA.length === 0 && entriesB.length === 0 ? (
        <EmptyState message={t(settings.language, "floatingCompareEmpty")} icon="📭" />
      ) : null}

      {!loadError && entriesA.length + entriesB.length > 0 && filteredA.length + filteredB.length === 0 ? (
        <EmptyState message={t(settings.language, "floatingCompareSearchNoResult")} icon="🔍" />
      ) : null}

      {!loadError && filteredA.length + filteredB.length > 0 ? (
        <section className="compare-viewer-search-columns">
          <article className="compare-viewer-row-card">
            <div className="compare-viewer-row-head">
              <h2>{t(settings.language, "floatingCompareColumnA")}</h2>
            </div>
            {filteredA.length ? (
              <CompareEntryList
                entries={filteredA}
                language={settings.language}
                sideKey="a"
                rowKey="search"
                onStatusChange={setActionStatus}
              />
            ) : (
              <div className="compare-viewer-empty-side">{t(settings.language, "floatingCompareRowEmpty")}</div>
            )}
          </article>

          <article className="compare-viewer-row-card">
            <div className="compare-viewer-row-head">
              <h2>{t(settings.language, "floatingCompareColumnB")}</h2>
            </div>
            {filteredB.length ? (
              <CompareEntryList
                entries={filteredB}
                language={settings.language}
                sideKey="b"
                rowKey="search"
                onStatusChange={setActionStatus}
              />
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
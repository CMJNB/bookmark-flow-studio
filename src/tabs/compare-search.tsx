import { useEffect, useMemo, useState } from "react"

import "./compare-viewer.css"
import { CompareEntryList } from "../components/CompareEntryList"
import { PageHeader } from "../components/PageHeader"
import { SearchInput } from "../components/SearchInput"
import { EmptyState } from "../components/EmptyState"
import { OptionSelector } from "../components/OptionSelector"
import { compareBookmarkSelections } from "../lib/compare-utils"
import { getTree } from "../lib/chrome-api"
import { buildSelectedExportRoots, flattenNodes } from "../lib/bookmark-utils"
import { loadCompareViewerState } from "../lib/compare-viewer-state"
import { useAppSettings } from "../lib/use-app-settings"
import { useStorageListener } from "../lib/use-storage-listener"
import { t, tf } from "../lib/i18n"
import type { BookmarkEntry } from "../types/bookmark"

type SortBy = "original" | "title-asc" | "title-desc" | "url-asc" | "url-desc"

function sortEntries(entries: BookmarkEntry[], sortBy: SortBy): BookmarkEntry[] {
  const sorted = [...entries]
  switch (sortBy) {
    case "title-asc":
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-CN"))
      break
    case "title-desc":
      sorted.sort((a, b) => (b.title || "").localeCompare(a.title || "", "zh-CN"))
      break
    case "url-asc":
      sorted.sort((a, b) => a.url.localeCompare(b.url, "zh-CN"))
      break
    case "url-desc":
      sorted.sort((a, b) => b.url.localeCompare(a.url, "zh-CN"))
      break
    case "original":
    default:
      break
  }
  return sorted
}

function CompareSearchPage() {
  const settings = useAppSettings()
  const [keyword, setKeyword] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("original")
  const [entriesA, setEntriesA] = useState<BookmarkEntry[]>([])
  const [entriesB, setEntriesB] = useState<BookmarkEntry[]>([])
  const [loadError, setLoadError] = useState("")
  const [actionStatus, setActionStatus] = useState("")

  const loadEntries = async (): Promise<void> => {
    try {
      const state = await loadCompareViewerState()
      if (!state) {
        return
      }

      const compareSetAIds = state.compareSetAIds ?? []
      const compareSetBIds = state.compareSetBIds ?? []

      if (compareSetAIds.length > 0 || compareSetBIds.length > 0) {
        const latestTree = await getTree()
        const latestNodes = flattenNodes(latestTree)

        const rootsA = buildSelectedExportRoots(latestTree, compareSetAIds, latestNodes)
        const rootsB = buildSelectedExportRoots(latestTree, compareSetBIds, latestNodes)
        const latestResult = compareBookmarkSelections(rootsA, rootsB)

        setEntriesA(latestResult.allEntriesA)
        setEntriesB(latestResult.allEntriesB)
        return
      }

      setEntriesA(state.compareResult.allEntriesA)
      setEntriesB(state.compareResult.allEntriesB)
    } catch (error) {
      setLoadError((error as Error).message)
    }
  }

  useEffect(() => {
    void loadEntries()
  }, [])

  useStorageListener(async () => {
    await loadEntries()
  })

  const normalizedKeyword = keyword.trim().toLowerCase()

  const matchEntry = (entry: BookmarkEntry): boolean => {
    if (!normalizedKeyword) {
      return true
    }

    return `${entry.title} ${entry.url} ${entry.path}`.toLowerCase().includes(normalizedKeyword)
  }

  const filteredA = useMemo(() => sortEntries(entriesA.filter(matchEntry), sortBy), [entriesA, normalizedKeyword, sortBy])
  const filteredB = useMemo(() => sortEntries(entriesB.filter(matchEntry), sortBy), [entriesB, normalizedKeyword, sortBy])

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

      <OptionSelector
        label={t(settings.language, "floatingCompareSortLabel")}
        options={[
          { value: "original", label: t(settings.language, "floatingCompareSortOriginal"), title: t(settings.language, "floatingCompareSortOriginalTitle") },
          { value: "title-asc", label: t(settings.language, "floatingCompareSortTitleAsc"), title: t(settings.language, "floatingCompareSortTitleAscTitle") },
          { value: "title-desc", label: t(settings.language, "floatingCompareSortTitleDesc"), title: t(settings.language, "floatingCompareSortTitleDescTitle") },
          { value: "url-asc", label: t(settings.language, "floatingCompareSortUrlAsc"), title: t(settings.language, "floatingCompareSortUrlAscTitle") },
          { value: "url-desc", label: t(settings.language, "floatingCompareSortUrlDesc"), title: t(settings.language, "floatingCompareSortUrlDescTitle") }
        ]}
        value={sortBy}
        onChange={setSortBy}
      />

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
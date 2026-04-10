import { openPopupWindow } from "../lib/chrome-api"
import { t, tf } from "../lib/i18n"
import type { BookmarkEntry } from "../types/bookmark"
import type { AppLanguage } from "../types/settings"

type CompareEntryListProps = {
  entries: BookmarkEntry[]
  language: AppLanguage
  sideKey: string
  rowKey: string
  onStatusChange: (status: string) => void
}

function canOpenEntryUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase()
  return Boolean(normalized) && !normalized.startsWith("javascript:") && !normalized.startsWith("data:")
}

export function CompareEntryList({
  entries,
  language,
  sideKey,
  rowKey,
  onStatusChange
}: CompareEntryListProps): JSX.Element {
  const openEntryUrl = (url: string): void => {
    if (!canOpenEntryUrl(url)) {
      onStatusChange(t(language, "floatingCompareOpenLinkBlocked"))
      return
    }

    onStatusChange("")
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const locateEntryInEditor = async (entry: BookmarkEntry): Promise<void> => {
    try {
      onStatusChange("")
      await openPopupWindow(
        chrome.runtime.getURL(`tabs/bookmark-editor.html?bookmarkId=${encodeURIComponent(entry.id)}`),
        900,
        700
      )
    } catch (error) {
      onStatusChange(
        tf(language, "floatingCompareLocateEditorFailed", {
          error: (error as Error).message
        })
      )
    }
  }

  return (
    <ul className="compare-viewer-entry-list">
      {entries.map((entry, index) => {
        const urlOpenable = canOpenEntryUrl(entry.url)

        return (
          <li key={`${sideKey}-${rowKey}-${entry.id}-${index}`} className="compare-viewer-entry-item">
            <div className="compare-viewer-entry-title">{entry.title || t(language, "emptyTitle")}</div>
            <div className="compare-viewer-entry-sub">URL: {entry.url}</div>
            <div className="compare-viewer-entry-sub">{t(language, "sourcePath")}: {entry.path || t(language, "rootPath")}</div>
            <div className="compare-viewer-entry-actions">
              <button
                className="compare-viewer-entry-btn"
                onClick={() => openEntryUrl(entry.url)}
                disabled={!urlOpenable}
                title={urlOpenable ? undefined : t(language, "floatingCompareOpenLinkBlocked")}
              >
                {t(language, "floatingCompareOpenLink")}
              </button>
              <button className="compare-viewer-entry-btn" onClick={() => void locateEntryInEditor(entry)}>
                {t(language, "floatingCompareLocateInEditor")}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}



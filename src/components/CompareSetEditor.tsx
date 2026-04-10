import { FolderTreeView } from "./FolderTreeView"
import { t } from "../lib/i18n"
import type { FolderTreeNode } from "../types/bookmark"
import type { AppLanguage } from "../types/settings"

type CompareSetEditorProps = {
  language: AppLanguage
  title: string
  nodes: FolderTreeNode[]
  expandedFolderIds: string[]
  selectedFolderIds: string[]
  onToggleExpanded: (id: string) => void
  onToggleSelected: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}

export function CompareSetEditor({
  language,
  title,
  nodes,
  expandedFolderIds,
  selectedFolderIds,
  onToggleExpanded,
  onToggleSelected,
  onSelectAll,
  onClear
}: CompareSetEditorProps): JSX.Element {
  return (
    <div className="compare-set-editor">
      <div className="compare-viewer-column-title">{title}</div>
      <div className="folder-list">
        <FolderTreeView
          nodes={nodes}
          expandedFolderIds={expandedFolderIds}
          selectedFolderIds={selectedFolderIds}
          onToggleExpanded={onToggleExpanded}
          onToggleSelected={onToggleSelected}
        />
      </div>
      <div className="controls">
        <button className="page-btn" onClick={onSelectAll}>
          {t(language, "compareSetSelectAll")}
        </button>
        <button className="page-btn" onClick={onClear}>
          {t(language, "compareSetClear")}
        </button>
      </div>
    </div>
  )
}

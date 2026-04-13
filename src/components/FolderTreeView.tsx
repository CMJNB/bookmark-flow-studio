import "./FolderTreeView.css"
import type { FolderTreeNode } from "../types/bookmark"

type FolderTreeViewProps = {
  nodes: FolderTreeNode[]
  expandedFolderIds: string[]
  selectedFolderIds: string[]
  onToggleExpanded: (id: string) => void
  onToggleSelected: (id: string) => void
}

export function FolderTreeView({
  nodes,
  expandedFolderIds,
  selectedFolderIds,
  onToggleExpanded,
  onToggleSelected
}: FolderTreeViewProps): JSX.Element {
  const render = (treeNodes: FolderTreeNode[], depth = 0): JSX.Element[] => {
    return treeNodes.map((node) => {
      const expanded = expandedFolderIds.includes(node.id)
      const hasChildren = node.children.length > 0

      return (
        <div key={node.id} className="tree-node">
          <div className="folder-row" style={{ paddingLeft: `${depth * 14}px` }}>
            <button
              type="button"
              className="tree-toggle"
              onClick={() => hasChildren && onToggleExpanded(node.id)}
              aria-label={expanded ? "收起" : "展开"}
            >
              {hasChildren ? (expanded ? "▾" : "▸") : "•"}
            </button>
            <label className="tree-label">
              <input
                type="checkbox"
                checked={selectedFolderIds.includes(node.id)}
                onChange={() => onToggleSelected(node.id)}
              />
              <span>{node.title}</span>
            </label>
          </div>
          {hasChildren && expanded ? <div>{render(node.children, depth + 1)}</div> : null}
        </div>
      )
    })
  }

  return <>{render(nodes)}</>
}

/// <reference types="chrome" />
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Tree } from "react-arborist"
import type { NodeApi, NodeRendererProps, TreeApi } from "react-arborist"

import "./bookmark-editor.css"
import { createBookmark, getTree, moveBookmark, removeBookmarkTree, updateBookmark } from "../lib/chrome-api"
import { useAppSettings } from "../lib/use-app-settings"
import { t, tf } from "../lib/i18n"
import type { BookmarkNode } from "../types/bookmark"
import type { AppSettings } from "../types/settings"

/* -- Types -- */

type ClipboardState = { mode: "copy" | "cut"; nodes: BookmarkNode[] }
type CreateState = { type: "folder" | "bookmark"; title: string; url: string }

/* -- Context: pass handlers into the custom node renderer -- */

type EditorCtx = {
  lang: AppSettings["language"]
  editingId: string | null
  treeApi: TreeApi<BookmarkNode> | null
  onClickEdit: (node: BookmarkNode) => void
  onClickDelete: (id: string, title: string) => void
  onClickOpen: (url: string) => void
}

const Ctx = createContext<EditorCtx>(null!)

/* -- Custom Node Renderer -- */

function BmkNode({ node, style, dragHandle }: NodeRendererProps<BookmarkNode>) {
  const { lang, editingId, treeApi, onClickEdit, onClickDelete, onClickOpen } = useContext(Ctx)
  const isFolder = !!node.data.children

  return (
    <div
      className={[
        "arb-row",
        node.state.isDragging && "dragging",
        node.state.willReceiveDrop && "drop-target",
        node.isSelected && "selected",
        editingId === node.id && "editing"
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      ref={dragHandle}
      onClick={(e) => node.handleClick(e)}
      onDoubleClick={() => onClickEdit(node.data)}
    >
      {isFolder ? (
        <button
          className="arb-toggle"
          onClick={(e) => {
            e.stopPropagation()
            if (e.shiftKey && treeApi) {
              const ids = collectDescendantFolderIds(node.data)
              if (node.isOpen) {
                for (const fid of ids) treeApi.close(fid)
                node.close()
              } else {
                node.open()
                for (const fid of ids) treeApi.open(fid)
              }
            } else {
              node.toggle()
            }
          }}
          title={
            node.isOpen
              ? `${t(lang, "editorCollapseSingle")} / Shift: ${t(lang, "editorCollapseRecursive")}`
              : `${t(lang, "editorExpandSingle")} / Shift: ${t(lang, "editorExpandRecursive")}`
          }
        >
          {node.isOpen ? "▼" : "▶"}
        </button>
      ) : (
        <span className="arb-leaf-icon">🔗</span>
      )}

      <div className="arb-info">
        <span className="arb-title">
          {node.data.title || `(${t(lang, "emptyTitle")})`}
        </span>
        {node.data.url && <span className="arb-url">{node.data.url}</span>}
      </div>

      {node.data.url && (
        <button
          className="arb-open"
          title={t(lang, "editorOpenLink")}
          onClick={(e) => {
            e.stopPropagation()
            onClickOpen(node.data.url!)
          }}
        >
          ↗
        </button>
      )}

      <button
        className="arb-delete"
        title={t(lang, "editorDelete")}
        onClick={(e) => {
          e.stopPropagation()
          onClickDelete(node.id, node.data.title)
        }}
      >
        ✕
      </button>
    </div>
  )
}

/* -- Helpers -- */

function findNodeById(nodes: BookmarkNode[], id: string): BookmarkNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children) {
      const found = findNodeById(n.children, id)
      if (found) return found
    }
  }
  return null
}

function findNodeLocation(nodes: BookmarkNode[], id: string, ancestorFolderIds: string[] = []): {
  node: BookmarkNode
  ancestorFolderIds: string[]
} | null {
  for (const node of nodes) {
    if (node.id === id) {
      return { node, ancestorFolderIds }
    }
    if (node.children) {
      const found = findNodeLocation(node.children, id, [...ancestorFolderIds, node.id])
      if (found) return found
    }
  }
  return null
}

function collectDescendantFolderIds(node: BookmarkNode): string[] {
  const ids: string[] = []
  if (node.children) {
    for (const child of node.children) {
      if (child.children) {
        ids.push(child.id)
        ids.push(...collectDescendantFolderIds(child))
      }
    }
  }
  return ids
}

async function createNodeRecursive(parentId: string, node: BookmarkNode): Promise<void> {
  const created = await createBookmark({
    parentId,
    title: node.title || "",
    url: node.url ?? undefined
  })
  if (node.children) {
    for (const child of node.children) {
      await createNodeRecursive(created.id, child)
    }
  }
}

/* -- Main Page -- */

function BookmarkEditorPage() {
  const settings = useAppSettings()
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [loadError, setLoadError] = useState("")
  const [status, setStatus] = useState("")
  const [treeHeight, setTreeHeight] = useState(500)
  const [editNode, setEditNode] = useState<{ id: string; title: string; url: string } | null>(null)
  const [createState, setCreateState] = useState<CreateState | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedData, setSelectedData] = useState<BookmarkNode[]>([])
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<BookmarkNode> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const openedOnce = useRef(false)
  const locateBookmarkId = useRef(new URLSearchParams(window.location.search).get("bookmarkId"))
  const locateHandled = useRef(false)

  const lang = settings.language

  /* -- Data loading -- */

  const reloadTree = useCallback(async () => {
    const data = await getTree()
    setTree(data[0]?.children ?? data)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await reloadTree()
      } catch (e) {
        setLoadError((e as Error).message)
      }
    })()
  }, [reloadTree])

  /* -- Open top-level folders after first load -- */
  useEffect(() => {
    if (!openedOnce.current && tree.length > 0 && treeRef.current) {
      openedOnce.current = true
      for (const n of tree) {
        if (n.children) treeRef.current.open(n.id)
      }
    }
  }, [tree])

  /* -- Locate bookmark -- */
  useEffect(() => {
    const targetId = locateBookmarkId.current
    if (!targetId || locateHandled.current || tree.length === 0 || !treeRef.current) {
      return
    }
    locateHandled.current = true

    const location = findNodeLocation(tree, targetId)
    if (!location) {
      setStatus(t(lang, "editorLocateMissing"))
      return
    }

    for (const folderId of location.ancestorFolderIds) {
      treeRef.current.open(folderId)
    }

    setEditNode({
      id: location.node.id,
      title: location.node.title,
      url: location.node.url ?? ""
    })

    requestAnimationFrame(() => {
      treeRef.current?.select(location.node.id)
      treeRef.current?.scrollTo(location.node.id, "center")
    })

    setStatus(
      tf(lang, "editorLocateSuccess", {
        title: location.node.title || t(lang, "emptyTitle")
      })
    )
  }, [lang, tree])

  /* -- Measure body height -- */
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setTreeHeight(Math.floor(entry.contentRect.height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* -- Search match count (counts direct hits, not parents) -- */
  const matchCount = useMemo(() => {
    if (!searchTerm) return null
    const lower = searchTerm.toLowerCase()
    let count = 0
    const visit = (nodes: BookmarkNode[]) => {
      for (const n of nodes) {
        if (n.title?.toLowerCase().includes(lower) || n.url?.toLowerCase().includes(lower)) count++
        if (n.children) visit(n.children)
      }
    }
    visit(tree)
    return count
  }, [tree, searchTerm])

  /* -- Custom search match for react-arborist -- */
  const searchMatch = useCallback((node: NodeApi<BookmarkNode>, term: string): boolean => {
    const lower = term.toLowerCase()
    return !!(node.data.title?.toLowerCase().includes(lower) || node.data.url?.toLowerCase().includes(lower))
  }, [])

  /* -- Handlers -- */

  const handleMove = useCallback(
    async ({
      dragIds,
      parentId,
      index
    }: {
      dragIds: string[]
      parentId: string | null
      index: number
    }) => {
      try {
        const pid = parentId ?? "0"
        for (const id of dragIds) {
          await moveBookmark(id, { parentId: pid, index })
        }
        await reloadTree()
      } catch (e) {
        setStatus(tf(lang, "editorMoveFailed", { error: (e as Error).message }))
      }
    },
    [lang, reloadTree]
  )

  const handleClickEdit = useCallback((node: BookmarkNode) => {
    setCreateState(null)
    setEditNode({ id: node.id, title: node.title, url: node.url ?? "" })
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editNode) return
    try {
      await updateBookmark(editNode.id, {
        title: editNode.title,
        url: editNode.url || undefined
      })
      setStatus(t(lang, "editorSaveSuccess"))
      setEditNode(null)
      await reloadTree()
    } catch (e) {
      setStatus(tf(lang, "editorSaveFailed", { error: (e as Error).message }))
    }
  }, [editNode, lang, reloadTree])

  const handleDeleteNode = useCallback(
    async (id: string, title: string) => {
      if (!window.confirm(tf(lang, "editorDeleteConfirm", { title }))) return
      try {
        await removeBookmarkTree(id)
        setStatus(t(lang, "editorDeleteSuccess"))
        if (editNode?.id === id) setEditNode(null)
        await reloadTree()
      } catch (e) {
        setStatus(tf(lang, "editorDeleteFailed", { error: (e as Error).message }))
      }
    },
    [lang, reloadTree, editNode]
  )

  const handleOpenLink = useCallback(
    (url: string) => {
      if (url.startsWith("javascript:") || url.startsWith("data:")) {
        setStatus(t(lang, "editorOpenLinkBlocked"))
        return
      }
      chrome.tabs.create({ url })
    },
    [lang]
  )

  /* -- Resolve paste/create target folder -- */
  const resolvePasteParentId = useCallback((): string => {
    const sel = treeRef.current?.mostRecentNode
    if (!sel) return "1"
    return sel.isInternal ? sel.id : (sel.data.parentId ?? "1")
  }, [])

  /* -- Create new bookmark/folder -- */
  const handleCreateSave = useCallback(async () => {
    if (!createState) return
    const parentId = resolvePasteParentId()
    try {
      await createBookmark({
        parentId,
        title:
          createState.title ||
          (createState.type === "folder"
            ? t(lang, "editorNewFolderDefaultName")
            : t(lang, "editorNewBookmarkDefaultTitle")),
        url: createState.type === "bookmark" ? createState.url || undefined : undefined
      })
      setStatus(t(lang, "editorCreateSuccess"))
      setCreateState(null)
      await reloadTree()
    } catch (e) {
      setStatus(tf(lang, "editorCreateFailed", { error: (e as Error).message }))
    }
  }, [createState, lang, reloadTree, resolvePasteParentId])

  /* -- Copy / Cut -- */
  const handleCopy = useCallback(() => {
    const nodes = treeRef.current?.selectedNodes
    if (!nodes?.length) return
    setClipboard({ mode: "copy", nodes: nodes.map((n) => n.data) })
    setStatus(tf(lang, "editorCopied", { count: nodes.length }))
  }, [lang])

  const handleCut = useCallback(() => {
    const nodes = treeRef.current?.selectedNodes
    if (!nodes?.length) return
    setClipboard({ mode: "cut", nodes: nodes.map((n) => n.data) })
    setStatus(tf(lang, "editorCutMarked", { count: nodes.length }))
  }, [lang])

  /* -- Paste -- */
  const handlePaste = useCallback(async () => {
    if (!clipboard) {
      setStatus(t(lang, "editorNothingToPaste"))
      return
    }
    const parentId = resolvePasteParentId()
    try {
      for (const node of clipboard.nodes) {
        await createNodeRecursive(parentId, node)
      }
      if (clipboard.mode === "cut") {
        for (const node of clipboard.nodes) {
          await removeBookmarkTree(node.id)
        }
        setClipboard(null)
      }
      setStatus(tf(lang, "editorPasteSuccess", { count: clipboard.nodes.length }))
      await reloadTree()
    } catch (e) {
      setStatus(tf(lang, "editorPasteFailed", { error: (e as Error).message }))
    }
  }, [clipboard, lang, reloadTree, resolvePasteParentId])

  /* -- Delete selected (bulk) -- */
  const handleDeleteSelected = useCallback(
    async (ids?: string[]) => {
      const targetIds = ids ?? treeRef.current?.selectedNodes.map((n) => n.id) ?? []
      if (!targetIds.length) return
      if (!window.confirm(tf(lang, "editorDeleteSelectedConfirm", { count: targetIds.length }))) return
      try {
        for (const id of targetIds) {
          await removeBookmarkTree(id)
        }
        setStatus(t(lang, "editorDeleteSuccess"))
        if (editNode && targetIds.includes(editNode.id)) setEditNode(null)
        setSelectedData([])
        await reloadTree()
      } catch (e) {
        setStatus(tf(lang, "editorDeleteFailed", { error: (e as Error).message }))
      }
    },
    [lang, reloadTree, editNode]
  )

  /* -- Global keyboard shortcuts -- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "c":
            handleCopy()
            e.preventDefault()
            break
          case "x":
            handleCut()
            e.preventDefault()
            break
          case "v":
            void handlePaste()
            e.preventDefault()
            break
          case "a":
            treeRef.current?.selectAll()
            e.preventDefault()
            break
          case "f":
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
            e.preventDefault()
            break
        }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [handleCopy, handleCut, handlePaste])

  /* -- Derived -- */
  const editIsFolder = editNode ? !!findNodeById(tree, editNode.id)?.children : false
  const selectedCount = selectedData.length

  const ctx: EditorCtx = {
    lang,
    editingId: editNode?.id ?? null,
    treeApi: treeRef.current,
    onClickEdit: handleClickEdit,
    onClickDelete: handleDeleteNode,
    onClickOpen: handleOpenLink
  }

  if (loadError) {
    return (
      <main className="editor-app">
        <div className="editor-error">{tf(lang, "editorLoadFailed", { error: loadError })}</div>
      </main>
    )
  }

  return (
    <Ctx.Provider value={ctx}>
      <main className="editor-app">
        <header className="editor-header">
          {/* Row 1: title + tree controls */}
          <div className="editor-header-top">
            <div className="editor-header-info">
              <h1>{t(lang, "editorTitle")}</h1>
              <p className="editor-header-hint">{t(lang, "editorHint")}</p>
            </div>
            <div className="editor-toolbar">
              <button className="editor-btn" title="Ctrl+A" onClick={() => treeRef.current?.selectAll()}>
                {t(lang, "editorSelectAll")}
              </button>
              <button className="editor-btn" onClick={() => treeRef.current?.openAll()}>
                {t(lang, "editorExpandAll")}
              </button>
              <button className="editor-btn" onClick={() => treeRef.current?.closeAll()}>
                {t(lang, "editorCollapseAll")}
              </button>
            </div>
          </div>

          {/* Row 2: search + action buttons */}
          <div className="editor-action-row">
            <div className="editor-search-field">
              <span className="editor-search-icon">🔍</span>
              <input
                ref={searchInputRef}
                className="editor-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t(lang, "editorSearchPlaceholder")}
                onKeyDown={(e) => e.key === "Escape" && setSearchTerm("")}
              />
              {searchTerm && (
                <button className="editor-search-clear" onClick={() => setSearchTerm("")}>
                  ×
                </button>
              )}
            </div>

            {matchCount !== null && (
              <span className="editor-search-count">
                {tf(lang, "editorSearchMatchCount", { count: matchCount })}
              </span>
            )}

            <button
              className="editor-btn editor-btn-primary"
              onClick={() => {
                setEditNode(null)
                setCreateState({ type: "folder", title: "", url: "" })
              }}
            >
              📁 {t(lang, "editorNewFolder")}
            </button>
            <button
              className="editor-btn editor-btn-primary"
              onClick={() => {
                setEditNode(null)
                setCreateState({ type: "bookmark", title: "", url: "" })
              }}
            >
              🔗 {t(lang, "editorNewBookmark")}
            </button>

            <div className="editor-action-sep" />

            <button
              className="editor-btn"
              disabled={selectedCount === 0}
              title="Ctrl+C"
              onClick={handleCopy}
            >
              {t(lang, "editorCopy")}
            </button>
            <button
              className="editor-btn"
              disabled={selectedCount === 0}
              title="Ctrl+X"
              onClick={handleCut}
            >
              {t(lang, "editorCut")}
            </button>
            <button
              className="editor-btn"
              disabled={!clipboard}
              title="Ctrl+V"
              onClick={() => void handlePaste()}
            >
              {t(lang, "editorPaste")}
              {clipboard ? ` (${clipboard.nodes.length})` : ""}
            </button>

            {selectedCount > 1 && (
              <>
                <div className="editor-action-sep" />
                <button
                  className="editor-btn editor-btn-danger"
                  onClick={() => void handleDeleteSelected()}
                >
                  {tf(lang, "editorDeleteSelected", { count: selectedCount })}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Create panel */}
        {createState && (
          <div className="editor-create-panel">
            <input
              className="editor-edit-input"
              value={createState.title}
              placeholder={
                createState.type === "folder"
                  ? t(lang, "editorNewFolderDefaultName")
                  : t(lang, "editorNewBookmarkDefaultTitle")
              }
              autoFocus
              onChange={(e) => setCreateState((p) => (p ? { ...p, title: e.target.value } : p))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateSave()
                if (e.key === "Escape") setCreateState(null)
              }}
            />
            {createState.type === "bookmark" && (
              <input
                className="editor-edit-input"
                value={createState.url}
                placeholder="https://..."
                onChange={(e) => setCreateState((p) => (p ? { ...p, url: e.target.value } : p))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateSave()
                  if (e.key === "Escape") setCreateState(null)
                }}
              />
            )}
            <div className="editor-edit-actions">
              <button className="editor-save-btn" onClick={() => void handleCreateSave()}>
                {t(lang, "editorSave")}
              </button>
              <button className="editor-cancel-btn" onClick={() => setCreateState(null)}>
                {t(lang, "editorCancel")}
              </button>
            </div>
          </div>
        )}

        {/* Edit panel */}
        {editNode && (
          <div className="editor-edit-panel">
            <input
              className="editor-edit-input"
              value={editNode.title}
              placeholder={t(lang, "editorTitlePlaceholder")}
              autoFocus
              onChange={(e) => setEditNode((p) => (p ? { ...p, title: e.target.value } : p))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveEdit()
                if (e.key === "Escape") setEditNode(null)
              }}
            />
            {!editIsFolder && (
              <input
                className="editor-edit-input"
                value={editNode.url}
                placeholder={t(lang, "editorUrlPlaceholder")}
                onChange={(e) => setEditNode((p) => (p ? { ...p, url: e.target.value } : p))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveEdit()
                  if (e.key === "Escape") setEditNode(null)
                }}
              />
            )}
            <div className="editor-edit-actions">
              <button className="editor-save-btn" onClick={() => void handleSaveEdit()}>
                {t(lang, "editorSave")}
              </button>
              <button className="editor-cancel-btn" onClick={() => setEditNode(null)}>
                {t(lang, "editorCancel")}
              </button>
            </div>
          </div>
        )}

        <div className="editor-body" ref={bodyRef}>
          {tree.length > 0 && (
            <Tree<BookmarkNode>
              ref={treeRef}
              data={tree}
              onMove={handleMove}
              onSelect={(nodes) => setSelectedData(nodes.map((n) => n.data))}
              onDelete={({ ids }) => void handleDeleteSelected(ids)}
              openByDefault={false}
              width="100%"
              height={treeHeight}
              indent={20}
              rowHeight={36}
              searchTerm={searchTerm}
              searchMatch={searchMatch}
              childrenAccessor={(d) => d.children ?? null}
            >
              {BmkNode}
            </Tree>
          )}
        </div>

        {status ? <div className="editor-status">{status}</div> : null}
      </main>
    </Ctx.Provider>
  )
}

export default BookmarkEditorPage

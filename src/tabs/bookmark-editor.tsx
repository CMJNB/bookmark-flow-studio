/// <reference types="chrome" />
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Tree } from "react-arborist"
import type { NodeRendererProps, TreeApi } from "react-arborist"

import "./bookmark-editor.css"
import { getTree, moveBookmark, removeBookmarkTree, updateBookmark } from "../lib/chrome-api"
import { applyTheme, defaultSettings, loadSettings } from "../lib/settings"
import { t, tf } from "../lib/i18n"
import type { BookmarkNode } from "../types/bookmark"
import type { AppSettings } from "../types/settings"

/* ── Context: pass handlers into the custom node renderer ── */

type EditorCtx = {
  lang: AppSettings["language"]
  editingId: string | null
  treeApi: TreeApi<BookmarkNode> | null
  onClickEdit: (node: BookmarkNode) => void
  onClickDelete: (id: string, title: string) => void
}

const Ctx = createContext<EditorCtx>(null!)

/* ── Custom Node Renderer ── */

function BmkNode({ node, style, dragHandle }: NodeRendererProps<BookmarkNode>) {
  const { lang, editingId, treeApi, onClickEdit, onClickDelete } = useContext(Ctx)
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

/* ── Helpers ── */

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

/* ── Main Page ── */

function BookmarkEditorPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [loadError, setLoadError] = useState("")
  const [status, setStatus] = useState("")
  const [treeHeight, setTreeHeight] = useState(500)
  const [editNode, setEditNode] = useState<{ id: string; title: string; url: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<BookmarkNode> | null>(null)
  const openedOnce = useRef(false)

  const lang = settings.language

  /* ── Data loading ── */

  const reloadTree = useCallback(async () => {
    const data = await getTree()
    setTree(data[0]?.children ?? data)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const s = await loadSettings()
        setSettings(s)
        applyTheme(s.theme)
        await reloadTree()
      } catch (e) {
        setLoadError((e as Error).message)
      }
    })()
  }, [reloadTree])

  useEffect(() => {
    const listener = (_c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return
      void (async () => {
        const s = await loadSettings()
        setSettings(s)
        applyTheme(s.theme)
      })()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  useEffect(() => {
    if (settings.theme !== "system") return undefined
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme("system")
    mq.addEventListener("change", listener)
    return () => mq.removeEventListener("change", listener)
  }, [settings.theme])

  /* ── Open top-level folders after first load ── */
  useEffect(() => {
    if (!openedOnce.current && tree.length > 0 && treeRef.current) {
      openedOnce.current = true
      for (const n of tree) {
        if (n.children) treeRef.current.open(n.id)
      }
    }
  }, [tree])

  /* ── Measure body height for virtualized tree ── */
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setTreeHeight(Math.floor(entry.contentRect.height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Handlers ── */

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

  const ctx: EditorCtx = {
    lang,
    editingId: editNode?.id ?? null,
    treeApi: treeRef.current,
    onClickEdit: handleClickEdit,
    onClickDelete: handleDeleteNode
  }

  const editIsFolder = editNode ? !!findNodeById(tree, editNode.id)?.children : false

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
          <div>
            <h1>{t(lang, "editorTitle")}</h1>
            <p className="editor-header-hint">{t(lang, "editorHint")}</p>
          </div>
          <div className="editor-toolbar">
            <button className="editor-btn" onClick={() => treeRef.current?.openAll()}>
              {t(lang, "editorExpandAll")}
            </button>
            <button className="editor-btn" onClick={() => treeRef.current?.closeAll()}>
              {t(lang, "editorCollapseAll")}
            </button>
          </div>
        </header>

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
              openByDefault={false}
              width="100%"
              height={treeHeight}
              indent={20}
              rowHeight={36}
              disableMultiSelection
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

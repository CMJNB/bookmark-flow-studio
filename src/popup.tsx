/// <reference types="chrome" />
import { useEffect, useMemo, useState } from "react"

import "../popup.css"
import { FolderTreeView } from "./components/FolderTreeView"
import { compareBookmarkSelections } from "./lib/compare-utils"
import type { CompareResult } from "./lib/compare-utils"
import { createBookmark, downloadTextFile, getTree } from "./lib/chrome-api"
import {
  buildFolderTree,
  buildSelectedExportRoots,
  countExportContent,
  flattenFolderTreeIds,
  flattenNodes,
  getDefaultImportParentId,
  getDescendantFolderIds,
  nodeToFull,
  nodeToSlim
} from "./lib/bookmark-utils"
import { formatDateForFileName } from "./lib/format"
import { t, tf } from "./lib/i18n"
import { normalizeImportData, parseStructuredInput } from "./lib/import-utils"
import { buildAiPrompt, toYaml } from "./lib/prompt-utils"
import { applyTheme, defaultSettings, loadSettings, saveSettings } from "./lib/settings"
import type { BookmarkNode, ExportNode, FolderTreeNode, PageKey } from "./types/bookmark"
import type { AppLanguage, AppSettings, ThemeMode } from "./types/settings"

type CompareFilter = "all" | "title-only" | "url-only" | "title-url-conflict"

async function createRecursive(parentId: string, item: ExportNode): Promise<void> {
  const title = typeof item.title === "string" ? item.title : "未命名"
  const url = typeof item.url === "string" ? item.url.trim() : ""

  if (url) {
    await createBookmark({ parentId, title, url })
    return
  }

  const folder = await createBookmark({ parentId, title })
  if (item.children?.length) {
    for (const child of item.children) {
      await createRecursive(folder.id, child)
    }
  }
}

function IndexPopup() {
  const [tree, setTree] = useState<BookmarkNode[]>([])
  const [activePage, setActivePage] = useState<PageKey>("select")
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([])
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([])
  const [compareSetA, setCompareSetA] = useState<string[]>([])
  const [compareSetB, setCompareSetB] = useState<string[]>([])
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [compareFilter, setCompareFilter] = useState<CompareFilter>("all")
  const [slimMode, setSlimMode] = useState(true)
  const [autoBackup, setAutoBackup] = useState(true)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [status, setStatus] = useState(t(defaultSettings.language, "statusIdle"))
  const [promptText, setPromptText] = useState("")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [pastedData, setPastedData] = useState("")
  const allNodes = useMemo(() => flattenNodes(tree), [tree])
  const msg = (zh: string, en: string) => (settings.language === "zh-CN" ? zh : en)

  useEffect(() => {
    ;(async () => {
      try {
        const loaded = await loadSettings()
        setSettings(loaded)
        applyTheme(loaded.theme)
        setStatus(t(loaded.language, "statusIdle"))

        const data = await getTree()
        setTree(data)
        const builtTree = buildFolderTree(data)
        setFolderTree(builtTree)
        setExpandedFolderIds(builtTree.map((item) => item.id))
      } catch (error) {
        setStatus(msg(`加载书签失败: ${(error as Error).message}`, `Failed to load bookmarks: ${(error as Error).message}`))
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

  const exportRoots = useMemo(() => {
    return buildSelectedExportRoots(tree, selectedFolderIds, allNodes)
  }, [allNodes, selectedFolderIds, tree])

  const exportStats = useMemo(() => {
    return countExportContent(exportRoots)
  }, [exportRoots])

  const selectedCountLabel = useMemo(() => {
    const base =
      selectedFolderIds.length === 0
        ? t(settings.language, "selectNoneExportAll")
        : tf(settings.language, "selectedFolderCount", { count: selectedFolderIds.length })

    return `${base}; ${tf(settings.language, "exportEstimate", {
      folders: exportStats.folders,
      links: exportStats.links
    })}`
  }, [exportStats.folders, exportStats.links, selectedFolderIds.length, settings.language])

  const toggleFolder = (id: string): void => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      const cascadeIds = [id, ...getDescendantFolderIds(id, allNodes)]

      if (next.has(id)) {
        for (const targetId of cascadeIds) {
          next.delete(targetId)
        }
      } else {
        for (const targetId of cascadeIds) {
          next.add(targetId)
        }
      }

      return [...next]
    })
  }

  const selectAllFolders = (): void => {
    setSelectedFolderIds(flattenFolderTreeIds(folderTree))
  }

  const clearFolderSelection = (): void => {
    setSelectedFolderIds([])
  }

  const buildExportData = (): { roots: BookmarkNode[]; output: unknown[] } => {
    const roots = exportRoots
    const output = slimMode ? roots.map(nodeToSlim) : roots.map(nodeToFull)
    return { roots, output }
  }

  const exportJson = async (backup = false): Promise<void> => {
    const { roots, output } = buildExportData()
    const json = JSON.stringify(output, null, 2)
    const stamp = formatDateForFileName(new Date())
    const mode = slimMode ? "slim" : "full"
    const fileName = `${backup ? "bookmarks-backup" : "bookmarks-export"}-${mode}-${stamp}.json`
    await downloadTextFile(fileName, json)
    setStatus(msg(`导出成功: ${fileName}，共 ${roots.length} 个根项`, `Exported: ${fileName}, ${roots.length} root items`))
  }

  const exportAiPrompt = async (): Promise<void> => {
    const { roots } = buildExportData()
    const slim = roots.map(nodeToSlim)
    const yaml = toYaml(slim)
    const prompt = buildAiPrompt(yaml)

    setPromptText(prompt)
    setStatus(
      msg(
        `AI 提示词已生成，共 ${roots.length} 个根项。请在预览区选择复制或下载。`,
        `AI prompt generated with ${roots.length} root items. Use copy or download in preview.`
      )
    )
  }

  const downloadAiPrompt = async (): Promise<void> => {
    if (!promptText.trim()) {
      setStatus(msg("请先生成 AI 提示词", "Please generate AI prompt first"))
      return
    }

    const stamp = formatDateForFileName(new Date())
    await downloadTextFile(`bookmarks-ai-prompt-${stamp}.txt`, promptText)
    setStatus(msg("AI 提示词已下载", "AI prompt downloaded"))
  }

  const readFileText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(new Error("文件读取失败"))
      reader.readAsText(file, "utf-8")
    })
  }

  const importFromText = async (rawText: string, sourceName: string): Promise<void> => {
    if (!rawText.trim()) {
      setStatus(msg("导入内容为空，请先上传文件或粘贴 JSON/YAML", "Import content is empty. Please upload or paste JSON/YAML"))
      return
    }

    const confirmed = window.confirm("导入前提醒: 建议先备份当前书签。点击确定继续")
    if (!confirmed) {
      setStatus(msg("已取消导入", "Import canceled"))
      return
    }

    if (autoBackup) {
      setStatus(msg("正在自动备份...", "Creating backup..."))
      await exportJson(true)
    }

    try {
      setStatus(msg("正在导入，请稍候...", "Importing, please wait..."))
      const parsed = parseStructuredInput(rawText)
      const items = normalizeImportData(parsed)
      const currentTree = await getTree()
      const parentId = getDefaultImportParentId(currentTree)
      const folder = await createBookmark({
        parentId,
        title: `AI 整理导入 ${new Date().toLocaleString("zh-CN")}`
      })

      for (const item of items) {
        await createRecursive(folder.id, item)
      }

      setStatus(
        msg(
          `导入完成，来源: ${sourceName}，目录: ${folder.title}，顶层项目: ${items.length}`,
          `Import completed. Source: ${sourceName}, Folder: ${folder.title}, Top-level items: ${items.length}`
        )
      )
    } catch (error) {
      setStatus(msg(`导入失败: ${(error as Error).message}`, `Import failed: ${(error as Error).message}`))
    }
  }

  const importFromFile = async (): Promise<void> => {
    if (!importFile) {
      setStatus(msg("请先选择文件（JSON/YAML）", "Please select a file (JSON/YAML)"))
      return
    }

    try {
      const text = await readFileText(importFile)
      await importFromText(text, importFile.name)
    } catch (error) {
      setStatus(msg(`读取文件失败: ${(error as Error).message}`, `Failed to read file: ${(error as Error).message}`))
    }
  }

  const importFromPastedData = async (): Promise<void> => {
    await importFromText(pastedData, "粘贴内容")
  }

  const copyAiPrompt = async (): Promise<void> => {
    if (!promptText.trim()) {
      setStatus(msg("请先生成 AI 提示词", "Please generate AI prompt first"))
      return
    }

    try {
      await navigator.clipboard.writeText(promptText)
      setStatus(msg("AI 提示词已复制到剪贴板", "AI prompt copied to clipboard"))
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = promptText
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setStatus(msg("AI 提示词已复制到剪贴板", "AI prompt copied to clipboard"))
    }
  }

  const toggleExpanded = (id: string): void => {
    setExpandedFolderIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const expandAllFolders = (): void => {
    setExpandedFolderIds(flattenFolderTreeIds(folderTree))
  }

  const collapseAllFolders = (): void => {
    setExpandedFolderIds([])
  }

  const saveSelectionAsA = (): void => {
    setCompareSetA([...new Set(selectedFolderIds)])
    setStatus(msg("当前选择已保存为集合 A", "Current selection saved as set A"))
  }

  const saveSelectionAsB = (): void => {
    setCompareSetB([...new Set(selectedFolderIds)])
    setStatus(msg("当前选择已保存为集合 B", "Current selection saved as set B"))
  }

  const runSelectionCompare = (): void => {
    const rootsA = buildSelectedExportRoots(tree, compareSetA, allNodes)
    const rootsB = buildSelectedExportRoots(tree, compareSetB, allNodes)
    setCompareResult(compareBookmarkSelections(rootsA, rootsB))
    setStatus(msg("对比完成", "Comparison completed"))
  }

  const clearCompareSets = (): void => {
    setCompareSetA([])
    setCompareSetB([])
    setCompareResult(null)
    setStatus(msg("已清空对比集合", "Compare sets cleared"))
  }

  const saveAppSettings = async (): Promise<void> => {
    await saveSettings(settings)
    applyTheme(settings.theme)
    setStatus(t(settings.language, "statusSettingsSaved"))
  }

  const setTheme = (theme: ThemeMode): void => {
    setSettings((prev) => ({ ...prev, theme }))
    applyTheme(theme)
  }

  const setLanguage = (language: AppLanguage): void => {
    setSettings((prev) => ({ ...prev, language }))
  }

  const renderEntryList = (title: string, items: Array<{ title: string; url: string; path: string }>): JSX.Element => {
    return (
      <div className="compare-block">
        <h3>{title}</h3>
        {items.length ? (
          <ul className="compare-list">
            {items.map((item, index) => (
              <li key={`${title}-${item.title}-${item.url}-${item.path}-${index}`}>
                <div className="compare-item-title">{item.title || t(settings.language, "emptyTitle")}</div>
                <div className="compare-item-sub">URL: {item.url}</div>
                <div className="compare-item-sub">{t(settings.language, "sourcePath")}: {item.path || t(settings.language, "rootPath")}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t(settings.language, "none")}</p>
        )}
      </div>
    )
  }

  return (
    <main className="app">
      <header className="header">
        <h1>{t(settings.language, "appTitle")}</h1>
        <p>{t(settings.language, "appSubtitle")}</p>
      </header>

      <section className="card">
        <h2>{t(settings.language, "stepsTitle")}</h2>
        <div className="pager">
          <button className={`page-btn ${activePage === "select" ? "active" : ""}`} onClick={() => setActivePage("select")}>{t(settings.language, "stepSelect")}</button>
          <button className={`page-btn ${activePage === "export" ? "active" : ""}`} onClick={() => setActivePage("export")}>{t(settings.language, "stepExport")}</button>
          <button className={`page-btn ${activePage === "import" ? "active" : ""}`} onClick={() => setActivePage("import")}>{t(settings.language, "stepImport")}</button>
          <button className={`page-btn ${activePage === "compare" ? "active" : ""}`} onClick={() => setActivePage("compare")}>{t(settings.language, "stepCompare")}</button>
          <button className={`page-btn ${activePage === "settings" ? "active" : ""}`} onClick={() => setActivePage("settings")}>{t(settings.language, "stepSettings")}</button>
        </div>
      </section>

      {activePage === "select" ? (
        <section className="card">
          <h2>{t(settings.language, "scopeTitle")}</h2>
          <p className="muted">{selectedCountLabel}</p>
          <div className="folder-list">
            <FolderTreeView
              nodes={folderTree}
              expandedFolderIds={expandedFolderIds}
              selectedFolderIds={selectedFolderIds}
              onToggleExpanded={toggleExpanded}
              onToggleSelected={toggleFolder}
            />
          </div>
          <div className="controls">
            <button className="link-btn" onClick={selectAllFolders}>{t(settings.language, "selectAll")}</button>
            <button className="link-btn" onClick={clearFolderSelection}>{t(settings.language, "clear")}</button>
            <button className="link-btn" onClick={expandAllFolders}>{t(settings.language, "expandAll")}</button>
            <button className="link-btn" onClick={collapseAllFolders}>{t(settings.language, "collapseAll")}</button>
          </div>
        </section>
      ) : null}

      {activePage === "export" ? (
        <>
          <section className="card">
            <h2>{t(settings.language, "exportTitle")}</h2>
            <label className="check">
              <input type="checkbox" checked={slimMode} onChange={(e) => setSlimMode(e.target.checked)} />
              <span>{t(settings.language, "slimMode")}</span>
            </label>
            <button className="btn primary" onClick={() => void exportJson(false)}>{t(settings.language, "exportJson")}</button>
            <button className="btn ok" onClick={() => void exportAiPrompt()}>{t(settings.language, "generatePrompt")}</button>
          </section>

          <section className="card">
            <h2>{t(settings.language, "promptPreview")}</h2>
            <div className="controls">
              <button className="link-btn" onClick={() => void copyAiPrompt()}>{t(settings.language, "copyPrompt")}</button>
              <button className="link-btn" onClick={() => void downloadAiPrompt()}>{t(settings.language, "downloadPrompt")}</button>
            </div>
            <pre className="prompt">{promptText || t(settings.language, "promptPlaceholder")}</pre>
          </section>
        </>
      ) : null}

      {activePage === "import" ? (
        <section className="card">
          <h2>{t(settings.language, "importTitle")}</h2>
          <label className="check">
            <input type="checkbox" checked={autoBackup} onChange={(e) => setAutoBackup(e.target.checked)} />
            <span>{t(settings.language, "autoBackup")}</span>
          </label>
          <input type="file" accept="application/json,.json,text/yaml,.yaml,.yml" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <button className="btn warn" onClick={() => void importFromFile()}>{t(settings.language, "importFromFile")}</button>
          <textarea className="paste-input" placeholder={t(settings.language, "pastePlaceholder")} value={pastedData} onChange={(e) => setPastedData(e.target.value)} />
          <button className="btn warn" onClick={() => void importFromPastedData()}>{t(settings.language, "importFromPaste")}</button>
        </section>
      ) : null}

      {activePage === "compare" ? (
        <section className="card">
          <h2>{t(settings.language, "compareTitle")}</h2>
          <p className="muted">{t(settings.language, "compareHint")}</p>
          <p className="muted">{tf(settings.language, "compareSetCount", { a: compareSetA.length, b: compareSetB.length })}</p>
          <div className="controls wrap">
            <button className="link-btn" onClick={saveSelectionAsA}>{t(settings.language, "saveAsA")}</button>
            <button className="link-btn" onClick={saveSelectionAsB}>{t(settings.language, "saveAsB")}</button>
            <button className="link-btn" onClick={runSelectionCompare}>{t(settings.language, "runCompare")}</button>
            <button className="link-btn" onClick={clearCompareSets}>{t(settings.language, "clearCompare")}</button>
          </div>

          {compareResult ? (
            <div className="compare-panel">
              <div className="compare-stats-grid">
                <div className="compare-stat">{msg("A条目", "A Entries")}: {compareResult.stats.aEntryCount}</div>
                <div className="compare-stat">{msg("B条目", "B Entries")}: {compareResult.stats.bEntryCount}</div>
                <div className="compare-stat">{msg("标题仅A", "Title Only A")}: {compareResult.stats.titleOnlyACount}</div>
                <div className="compare-stat">{msg("标题仅B", "Title Only B")}: {compareResult.stats.titleOnlyBCount}</div>
                <div className="compare-stat">{msg("URL仅A", "URL Only A")}: {compareResult.stats.urlOnlyACount}</div>
                <div className="compare-stat">{msg("URL仅B", "URL Only B")}: {compareResult.stats.urlOnlyBCount}</div>
                <div className="compare-stat">{msg("标题交集", "Title Intersection")}: {compareResult.stats.titleBothCount}</div>
                <div className="compare-stat">{msg("URL交集", "URL Intersection")}: {compareResult.stats.urlBothCount}</div>
                <div className="compare-stat wide">{msg("同标题不同URL", "Same Title Different URL")}: {compareResult.stats.sameTitleDifferentUrlCount}</div>
              </div>

              <div className="controls wrap compare-filter-row">
                <button className={`page-btn ${compareFilter === "all" ? "active" : ""}`} onClick={() => setCompareFilter("all")}>{t(settings.language, "compareFilterAll")}</button>
                <button className={`page-btn ${compareFilter === "title-only" ? "active" : ""}`} onClick={() => setCompareFilter("title-only")}>{t(settings.language, "compareFilterTitle")}</button>
                <button className={`page-btn ${compareFilter === "url-only" ? "active" : ""}`} onClick={() => setCompareFilter("url-only")}>{t(settings.language, "compareFilterUrl")}</button>
                <button className={`page-btn ${compareFilter === "title-url-conflict" ? "active" : ""}`} onClick={() => setCompareFilter("title-url-conflict")}>{t(settings.language, "compareFilterConflict")}</button>
              </div>

              <div className="compare-result-scroll">
                {compareFilter === "all" || compareFilter === "title-only" ? renderEntryList(t(settings.language, "titleOnlyAAll"), compareResult.titleOnlyA) : null}
                {compareFilter === "all" || compareFilter === "title-only" ? renderEntryList(t(settings.language, "titleOnlyBAll"), compareResult.titleOnlyB) : null}
                {compareFilter === "all" || compareFilter === "url-only" ? renderEntryList(t(settings.language, "urlOnlyAAll"), compareResult.urlOnlyA) : null}
                {compareFilter === "all" || compareFilter === "url-only" ? renderEntryList(t(settings.language, "urlOnlyBAll"), compareResult.urlOnlyB) : null}

                {compareFilter === "all" || compareFilter === "title-url-conflict" ? (
                  <div className="compare-block">
                    <h3>{t(settings.language, "conflictAll")}</h3>
                    {compareResult.sameTitleDifferentUrl.length ? (
                      <ul className="compare-list">
                        {compareResult.sameTitleDifferentUrl.map((item, index) => (
                          <li key={`${item.title}-${index}`}>
                            <div className="compare-item-title">{item.title}</div>
                            <div className="compare-item-sub">A URLs: {item.aUrls.join(" | ")}</div>
                            <div className="compare-item-sub">B URLs: {item.bUrls.join(" | ")}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">{t(settings.language, "none")}</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <pre className="status">{t(settings.language, "noCompare")}</pre>
          )}
        </section>
      ) : null}

      {activePage === "settings" ? (
        <section className="card">
          <h2>{t(settings.language, "settingsTitle")}</h2>
          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "settingsTheme")}</div>
            <div className="controls wrap">
              <button className={`page-btn ${settings.theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>{t(settings.language, "themeLight")}</button>
              <button className={`page-btn ${settings.theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>{t(settings.language, "themeDark")}</button>
              <button className={`page-btn ${settings.theme === "system" ? "active" : ""}`} onClick={() => setTheme("system")}>{t(settings.language, "themeSystem")}</button>
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "settingsLanguage")}</div>
            <div className="controls wrap">
              <button className={`page-btn ${settings.language === "zh-CN" ? "active" : ""}`} onClick={() => setLanguage("zh-CN")}>{t(settings.language, "langZh")}</button>
              <button className={`page-btn ${settings.language === "en-US" ? "active" : ""}`} onClick={() => setLanguage("en-US")}>{t(settings.language, "langEn")}</button>
            </div>
          </div>

          <button className="btn primary" onClick={() => void saveAppSettings()}>{t(settings.language, "saveSettings")}</button>
        </section>
      ) : null}

      <section className="card">
        <h2>{t(settings.language, "statusTitle")}</h2>
        <pre className="status">{status}</pre>
      </section>
    </main>
  )
}

export default IndexPopup

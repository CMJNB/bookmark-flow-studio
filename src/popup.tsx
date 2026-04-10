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
import { DEFAULT_PROMPT_TEMPLATE, buildAiPrompt, toYaml } from "./lib/prompt-utils"
import {
  applyTheme,
  defaultPromptTemplateState,
  defaultSettings,
  loadPromptTemplateState,
  loadSettings,
  normalizePromptTemplateState,
  savePromptTemplateState,
  saveSettings
} from "./lib/settings"
import type { BookmarkNode, ExportNode, FolderTreeNode, PageKey } from "./types/bookmark"
import type { AppConfigSnapshot, AppLanguage, AppSettings, PromptTemplateState, ThemeMode } from "./types/settings"

type CompareFilter = "all" | "title-only" | "url-only" | "title-url-conflict"

async function createRecursive(parentId: string, item: ExportNode): Promise<void> {
  const title = typeof item.title === "string" ? item.title : "Untitled"
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

function toThemeMode(value: unknown, fallback: ThemeMode): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : fallback
}

function toLanguage(value: unknown, fallback: AppLanguage): AppLanguage {
  return value === "zh-CN" || value === "en-US" ? value : fallback
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
  const [templateState, setTemplateState] = useState<PromptTemplateState>(defaultPromptTemplateState)
  const [editingTemplateId, setEditingTemplateId] = useState(defaultPromptTemplateState.selectedTemplateId)
  const [templateNameDraft, setTemplateNameDraft] = useState(defaultPromptTemplateState.templates[0].name)
  const [templateContentDraft, setTemplateContentDraft] = useState(defaultPromptTemplateState.templates[0].content)
  const [status, setStatus] = useState(t(defaultSettings.language, "statusIdle"))
  const [promptText, setPromptText] = useState("")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [pastedData, setPastedData] = useState("")
  const [configImportFile, setConfigImportFile] = useState<File | null>(null)
  const [configPastedData, setConfigPastedData] = useState("")
  const [isStatusVisible, setIsStatusVisible] = useState(false)
  const [copyPromptSuccess, setCopyPromptSuccess] = useState(false)
  const allNodes = useMemo(() => flattenNodes(tree), [tree])
  const activeTemplate = useMemo(() => {
    return (
      templateState.templates.find((item) => item.id === templateState.selectedTemplateId) ??
      templateState.templates[0] ??
      defaultPromptTemplateState.templates[0]
    )
  }, [templateState])

  const editingTemplate = useMemo(() => {
    return templateState.templates.find((item) => item.id === editingTemplateId) ?? null
  }, [editingTemplateId, templateState.templates])

  const setStatusByKey = (key: string, vars?: Record<string, string | number>): void => {
    setStatus(vars ? tf(settings.language, key, vars) : t(settings.language, key))
    setIsStatusVisible(true)
  }

  const openTemplateForEdit = (id: string): void => {
    const target = templateState.templates.find((item) => item.id === id)
    if (!target) {
      return
    }

    setEditingTemplateId(target.id)
    setTemplateNameDraft(target.name)
    setTemplateContentDraft(target.content)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const loaded = await loadSettings()
        const loadedTemplateState = await loadPromptTemplateState()
        setSettings(loaded)
        setTemplateState(loadedTemplateState)
        applyTheme(loaded.theme)
        setStatus(t(loaded.language, "statusIdle"))

        const firstEditTemplate =
          loadedTemplateState.templates.find((item) => item.id === loadedTemplateState.selectedTemplateId) ??
          loadedTemplateState.templates[0]
        if (firstEditTemplate) {
          setEditingTemplateId(firstEditTemplate.id)
          setTemplateNameDraft(firstEditTemplate.name)
          setTemplateContentDraft(firstEditTemplate.content)
        }

        const data = await getTree()
        setTree(data)
        const builtTree = buildFolderTree(data)
        setFolderTree(builtTree)
        setExpandedFolderIds(builtTree.map((item) => item.id))
      } catch (error) {
        setStatusByKey("statusLoadBookmarksFailed", { error: (error as Error).message })
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

  useEffect(() => {
    if (!editingTemplate) {
      return
    }

    setTemplateNameDraft(editingTemplate.name)
    setTemplateContentDraft(editingTemplate.content)
  }, [editingTemplate])

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
    setStatusByKey("statusExportSuccess", { fileName, count: roots.length })
  }

  const exportAiPrompt = async (): Promise<void> => {
    const { roots } = buildExportData()
    const slim = roots.map(nodeToSlim)
    const yaml = toYaml(slim)
    const prompt = buildAiPrompt(yaml, activeTemplate.content)

    setPromptText(prompt)
    setStatusByKey("statusPromptGenerated", { count: roots.length })
  }

  const persistTemplateState = async (next: PromptTemplateState, successStatus: string): Promise<void> => {
    const normalized = normalizePromptTemplateState(next)
    setTemplateState(normalized)
    await savePromptTemplateState(normalized)
    setStatus(successStatus)
  }

  const createTemplate = async (): Promise<void> => {
    const id = `tpl-${Date.now()}`
    const now = Date.now()
    const newTemplate = {
      id,
      name: t(settings.language, "newTemplateName"),
      content: DEFAULT_PROMPT_TEMPLATE,
      updatedAt: now
    }

    const next = {
      ...templateState,
      templates: [...templateState.templates, newTemplate]
    }

    await persistTemplateState(next, t(settings.language, "statusTemplateCreated"))
    setEditingTemplateId(id)
    setTemplateNameDraft(newTemplate.name)
    setTemplateContentDraft(newTemplate.content)
  }

  const saveTemplateDraft = async (): Promise<void> => {
    if (!editingTemplate) {
      setStatusByKey("statusNoEditableTemplate")
      return
    }

    const name = templateNameDraft.trim() || t(settings.language, "untitledTemplate")
    const content = templateContentDraft.trim()
    if (!content) {
      setStatusByKey("statusTemplateEmpty")
      return
    }

    const next = {
      ...templateState,
      templates: templateState.templates.map((item) =>
        item.id === editingTemplate.id
          ? {
              ...item,
              name,
              content,
              updatedAt: Date.now()
            }
          : item
      )
    }

    await persistTemplateState(next, t(settings.language, "statusTemplateSaved"))
  }

  const applyEditingTemplate = async (): Promise<void> => {
    if (!editingTemplate) {
      setStatusByKey("statusNoTemplateToApply")
      return
    }

    const next = {
      ...templateState,
      selectedTemplateId: editingTemplate.id
    }

    await persistTemplateState(next, t(settings.language, "statusTemplateApplied"))
  }

  const deleteEditingTemplate = async (): Promise<void> => {
    if (!editingTemplate) {
      setStatusByKey("statusNoTemplateToDelete")
      return
    }

    if (templateState.templates.length <= 1) {
      setStatusByKey("statusKeepOneTemplate")
      return
    }

    const remaining = templateState.templates.filter((item) => item.id !== editingTemplate.id)
    const fallback = remaining[0]
    const nextSelected =
      templateState.selectedTemplateId === editingTemplate.id ? fallback.id : templateState.selectedTemplateId
    const next = {
      selectedTemplateId: nextSelected,
      templates: remaining
    }

    await persistTemplateState(next, t(settings.language, "statusTemplateDeleted"))
    openTemplateForEdit(fallback.id)
  }

  const restoreDefaultTemplate = (): void => {
    setTemplateContentDraft(DEFAULT_PROMPT_TEMPLATE)
    setStatusByKey("statusTemplateRestoredRememberSave")
  }

  const downloadAiPrompt = async (): Promise<void> => {
    if (!promptText.trim()) {
      setStatusByKey("statusGeneratePromptFirst")
      return
    }

    const stamp = formatDateForFileName(new Date())
    await downloadTextFile(`bookmarks-ai-prompt-${stamp}.txt`, promptText)
    setStatusByKey("statusPromptDownloaded")
  }

  const readFileText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(new Error("File read failed"))
      reader.readAsText(file, "utf-8")
    })
  }

  const importFromText = async (rawText: string, sourceName: string): Promise<void> => {
    if (!rawText.trim()) {
      setStatusByKey("statusImportContentEmpty")
      return
    }

    const confirmed = window.confirm(t(settings.language, "confirmImportWithBackup"))
    if (!confirmed) {
      setStatusByKey("statusImportCanceled")
      return
    }

    if (autoBackup) {
      setStatusByKey("statusCreatingBackup")
      await exportJson(true)
    }

    try {
      setStatusByKey("statusImporting")
      const parsed = parseStructuredInput(rawText)
      const items = normalizeImportData(parsed)
      const currentTree = await getTree()
      const parentId = getDefaultImportParentId(currentTree)
      const importPrefix = t(settings.language, "importFolderPrefix")
      const folder = await createBookmark({
        parentId,
        title: `${importPrefix} ${new Date().toLocaleString(settings.language)}`
      })

      for (const item of items) {
        await createRecursive(folder.id, item)
      }

      setStatusByKey("statusImportCompleted", { source: sourceName, folder: folder.title, count: items.length })
    } catch (error) {
      setStatusByKey("statusImportFailed", { error: (error as Error).message })
    }
  }

  const importFromFile = async (): Promise<void> => {
    if (!importFile) {
      setStatusByKey("statusChooseImportFile")
      return
    }

    try {
      const text = await readFileText(importFile)
      await importFromText(text, importFile.name)
    } catch (error) {
      setStatusByKey("statusReadFileFailed", { error: (error as Error).message })
    }
  }

  const importFromPastedData = async (): Promise<void> => {
    await importFromText(pastedData, t(settings.language, "pastedContent"))
  }

  const copyAiPrompt = async (): Promise<void> => {
    if (!promptText.trim()) {
      setStatusByKey("statusGeneratePromptFirst")
      return
    }

    try {
      await navigator.clipboard.writeText(promptText)
      setStatusByKey("statusPromptCopied")
      setCopyPromptSuccess(true)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = promptText
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setStatusByKey("statusPromptCopied")
      setCopyPromptSuccess(true)
    }

    window.setTimeout(() => setCopyPromptSuccess(false), 1200)
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
    setStatusByKey("statusSelectionSavedA")
  }

  const saveSelectionAsB = (): void => {
    setCompareSetB([...new Set(selectedFolderIds)])
    setStatusByKey("statusSelectionSavedB")
  }

  const runSelectionCompare = (): void => {
    const rootsA = buildSelectedExportRoots(tree, compareSetA, allNodes)
    const rootsB = buildSelectedExportRoots(tree, compareSetB, allNodes)
    setCompareResult(compareBookmarkSelections(rootsA, rootsB))
    setStatusByKey("statusCompareDone")
  }

  const clearCompareSets = (): void => {
    setCompareSetA([])
    setCompareSetB([])
    setCompareResult(null)
    setStatusByKey("statusCompareCleared")
  }

  const saveAppSettings = async (): Promise<void> => {
    await saveSettings(settings)
    applyTheme(settings.theme)
    setStatus(t(settings.language, "statusSettingsSaved"))
  }

  const exportConfig = async (): Promise<void> => {
    const snapshot: AppConfigSnapshot = {
      version: 1,
      settings,
      slimMode,
      autoBackup,
      promptTemplates: templateState
    }

    const stamp = formatDateForFileName(new Date())
    await downloadTextFile(`bookmark-structurer-config-${stamp}.json`, JSON.stringify(snapshot, null, 2))
    setStatusByKey("statusConfigExported")
  }

  const importConfigFromText = async (rawText: string, sourceName: string): Promise<void> => {
    if (!rawText.trim()) {
      setStatusByKey("statusConfigEmpty")
      return
    }

    try {
      const parsed = parseStructuredInput(rawText) as Record<string, unknown>
      const incomingSettings = (parsed.settings as Record<string, unknown> | undefined) ?? {}
      const nextSettings: AppSettings = {
        theme: toThemeMode(incomingSettings.theme, settings.theme),
        language: toLanguage(incomingSettings.language, settings.language)
      }
      const nextSlimMode = typeof parsed.slimMode === "boolean" ? parsed.slimMode : slimMode
      const nextAutoBackup = typeof parsed.autoBackup === "boolean" ? parsed.autoBackup : autoBackup
      const nextTemplateState = normalizePromptTemplateState(parsed.promptTemplates)

      await saveSettings(nextSettings)
      await savePromptTemplateState(nextTemplateState)

      setSettings(nextSettings)
      setSlimMode(nextSlimMode)
      setAutoBackup(nextAutoBackup)
      setTemplateState(nextTemplateState)
      applyTheme(nextSettings.theme)

      const editTarget =
        nextTemplateState.templates.find((item) => item.id === nextTemplateState.selectedTemplateId) ?? nextTemplateState.templates[0]
      if (editTarget) {
        setEditingTemplateId(editTarget.id)
        setTemplateNameDraft(editTarget.name)
        setTemplateContentDraft(editTarget.content)
      }

      setStatusByKey("statusConfigImported", { source: sourceName })
    } catch (error) {
      setStatusByKey("statusConfigImportFailed", { error: (error as Error).message })
    }
  }

  const importConfigFromFile = async (): Promise<void> => {
    if (!configImportFile) {
      setStatusByKey("statusChooseConfigFile")
      return
    }

    try {
      const text = await readFileText(configImportFile)
      await importConfigFromText(text, configImportFile.name)
    } catch (error) {
      setStatusByKey("statusReadConfigFileFailed", { error: (error as Error).message })
    }
  }

  const importConfigFromPastedData = async (): Promise<void> => {
    await importConfigFromText(configPastedData, t(settings.language, "pastedContent"))
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
          <button className={`page-btn ${activePage === "select" ? "active" : ""}`} onClick={() => setActivePage("select")}>1. {t(settings.language, "stepSelect")}</button>
          <button className={`page-btn ${activePage === "templates" ? "active" : ""}`} onClick={() => setActivePage("templates")}>2. {t(settings.language, "stepTemplates")}</button>
          <button className={`page-btn ${activePage === "export" ? "active" : ""}`} onClick={() => setActivePage("export")}>3. {t(settings.language, "stepExport")}</button>
          <button className={`page-btn ${activePage === "import" ? "active" : ""}`} onClick={() => setActivePage("import")}>4. {t(settings.language, "stepImport")}</button>
          <button className={`page-btn ${activePage === "compare" ? "active" : ""}`} onClick={() => setActivePage("compare")}>5. {t(settings.language, "stepCompare")}</button>
          <button className={`page-btn ${activePage === "settings" ? "active" : ""}`} onClick={() => setActivePage("settings")}>6. {t(settings.language, "stepSettings")}</button>
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

      {activePage === "templates" ? (
        <section className="card">
          <h2>{t(settings.language, "templateTitle")}</h2>
          <p className="muted">{t(settings.language, "templateHint")}</p>

          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "templateList")}</div>
            <div className="controls wrap">
              {templateState.templates.map((item) => (
                <button
                  key={item.id}
                  className={`page-btn ${editingTemplateId === item.id ? "active" : ""}`}
                  onClick={() => openTemplateForEdit(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "templateName")}</div>
            <input
              className="text-input"
              value={templateNameDraft}
              onChange={(e) => setTemplateNameDraft(e.target.value)}
              placeholder={t(settings.language, "templateName")}
            />
          </div>

          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "templateContent")}</div>
            <textarea
              className="paste-input template-editor"
              placeholder={t(settings.language, "templateContentPlaceholder")}
              value={templateContentDraft}
              onChange={(e) => setTemplateContentDraft(e.target.value)}
            />
          </div>

          <div className="controls wrap">
            <button className="link-btn" onClick={() => void createTemplate()}>{t(settings.language, "newTemplate")}</button>
            <button className="link-btn" onClick={() => void saveTemplateDraft()}>{t(settings.language, "saveTemplate")}</button>
            <button className="link-btn" onClick={() => void applyEditingTemplate()}>{t(settings.language, "applyTemplate")}</button>
            <button className="link-btn" onClick={() => void deleteEditingTemplate()}>{t(settings.language, "deleteTemplate")}</button>
            <button className="link-btn" onClick={restoreDefaultTemplate}>{t(settings.language, "restoreDefaultTemplate")}</button>
          </div>
        </section>
      ) : null}

      {activePage === "export" ? (
        <>
          <section className="card">
            <h2>{t(settings.language, "exportTitle")}</h2>
            <p className="muted">{tf(settings.language, "activeTemplate", { name: activeTemplate.name })}</p>
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
              <button className={`link-btn feedback-btn ${copyPromptSuccess ? "success" : ""}`} onClick={() => void copyAiPrompt()}>
                {copyPromptSuccess ? t(settings.language, "copied") : t(settings.language, "copyPrompt")}
              </button>
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
                <div className="compare-stat">{t(settings.language, "compareStatAEntries")}: {compareResult.stats.aEntryCount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatBEntries")}: {compareResult.stats.bEntryCount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatTitleOnlyA")}: {compareResult.stats.titleOnlyACount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatTitleOnlyB")}: {compareResult.stats.titleOnlyBCount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatUrlOnlyA")}: {compareResult.stats.urlOnlyACount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatUrlOnlyB")}: {compareResult.stats.urlOnlyBCount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatTitleBoth")}: {compareResult.stats.titleBothCount}</div>
                <div className="compare-stat">{t(settings.language, "compareStatUrlBoth")}: {compareResult.stats.urlBothCount}</div>
                <div className="compare-stat wide">{t(settings.language, "compareStatConflict")}: {compareResult.stats.sameTitleDifferentUrlCount}</div>
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
                            <div className="compare-item-sub">{t(settings.language, "compareAUrls")}: {item.aUrls.join(" | ")}</div>
                            <div className="compare-item-sub">{t(settings.language, "compareBUrls")}: {item.bUrls.join(" | ")}</div>
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

          <div className="settings-group">
            <div className="settings-label">{t(settings.language, "settingsConfig")}</div>
            <button className="btn ok" onClick={() => void exportConfig()}>{t(settings.language, "exportConfig")}</button>
            <input
              type="file"
              accept="application/json,.json,text/yaml,.yaml,.yml"
              onChange={(e) => setConfigImportFile(e.target.files?.[0] ?? null)}
            />
            <button className="btn warn" onClick={() => void importConfigFromFile()}>{t(settings.language, "importConfigFromFile")}</button>
            <textarea
              className="paste-input"
              placeholder={t(settings.language, "configPastePlaceholder")}
              value={configPastedData}
              onChange={(e) => setConfigPastedData(e.target.value)}
            />
            <button className="btn warn" onClick={() => void importConfigFromPastedData()}>{t(settings.language, "importConfigFromPaste")}</button>
          </div>

          <button className="btn primary" onClick={() => void saveAppSettings()}>{t(settings.language, "saveSettings")}</button>
        </section>
      ) : null}

      {isStatusVisible || status !== t(settings.language, "statusIdle") ? (
        <section className="card">
          <div className="status-header">
            <h2>{t(settings.language, "statusTitle")}</h2>
            <button className="link-btn" onClick={() => setIsStatusVisible((prev) => !prev)}>
              {isStatusVisible ? t(settings.language, "statusSectionToggleHide") : t(settings.language, "statusSectionToggleShow")}
            </button>
          </div>
          {isStatusVisible ? <pre className="status">{status}</pre> : null}
        </section>
      ) : null}
    </main>
  )
}

export default IndexPopup

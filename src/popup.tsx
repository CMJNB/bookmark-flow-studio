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
import { normalizeImportData, parseStructuredInput } from "./lib/import-utils"
import { buildAiPrompt, toYaml } from "./lib/prompt-utils"
import type { BookmarkNode, ExportNode, FolderTreeNode, PageKey } from "./types/bookmark"

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
	const [status, setStatus] = useState("等待操作")
	const [promptText, setPromptText] = useState("")
	const [importFile, setImportFile] = useState<File | null>(null)
	const [pastedData, setPastedData] = useState("")
	const allNodes = useMemo(() => flattenNodes(tree), [tree])

	useEffect(() => {
		;(async () => {
			try {
				const t = await getTree()
				setTree(t)
				const builtTree = buildFolderTree(t)
				setFolderTree(builtTree)
				setExpandedFolderIds(builtTree.map((item) => item.id))
			} catch (error) {
				setStatus(`加载书签失败: ${(error as Error).message}`)
			}
		})()
	}, [])

	const exportRoots = useMemo(() => {
		return buildSelectedExportRoots(tree, selectedFolderIds, allNodes)
	}, [allNodes, selectedFolderIds, tree])

	const exportStats = useMemo(() => {
		return countExportContent(exportRoots)
	}, [exportRoots])

	const selectedCountLabel = useMemo(() => {
		const base = selectedFolderIds.length === 0 ? "未选择（默认导出全部）" : `已选择 ${selectedFolderIds.length} 个文件夹`
		return `${base}；预计导出 ${exportStats.folders} 个文件夹、${exportStats.links} 条链接`
	}, [exportStats.folders, exportStats.links, selectedFolderIds.length])

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
		setStatus(`导出成功: ${fileName}，共 ${roots.length} 个根项`)
	}

	const exportAiPrompt = async (): Promise<void> => {
		const { roots } = buildExportData()
		const slim = roots.map(nodeToSlim)
		const yaml = toYaml(slim)
		const prompt = buildAiPrompt(yaml)

		setPromptText(prompt)
		setStatus(`AI 提示词已生成，共 ${roots.length} 个根项。请在预览区选择复制或下载。`)
	}

	const downloadAiPrompt = async (): Promise<void> => {
		if (!promptText.trim()) {
			setStatus("请先生成 AI 提示词")
			return
		}

		const stamp = formatDateForFileName(new Date())
		await downloadTextFile(`bookmarks-ai-prompt-${stamp}.txt`, promptText)
		setStatus("AI 提示词已下载")
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
			setStatus("导入内容为空，请先上传文件或粘贴 JSON/YAML")
			return
		}

		const confirmed = window.confirm("导入前提醒: 建议先备份当前书签。点击确定继续")
		if (!confirmed) {
			setStatus("已取消导入")
			return
		}

		if (autoBackup) {
			setStatus("正在自动备份...")
			await exportJson(true)
		}

		try {
			setStatus("正在导入，请稍候...")
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

			setStatus(`导入完成，来源: ${sourceName}，目录: ${folder.title}，顶层项目: ${items.length}`)
		} catch (error) {
			setStatus(`导入失败: ${(error as Error).message}`)
		}
	}

	const importFromFile = async (): Promise<void> => {
		if (!importFile) {
			setStatus("请先选择文件（JSON/YAML）")
			return
		}

		try {
			const text = await readFileText(importFile)
			await importFromText(text, importFile.name)
		} catch (error) {
			setStatus(`读取文件失败: ${(error as Error).message}`)
		}
	}

	const importFromPastedData = async (): Promise<void> => {
		await importFromText(pastedData, "粘贴内容")
	}

	const copyAiPrompt = async (): Promise<void> => {
		if (!promptText.trim()) {
			setStatus("请先生成 AI 提示词")
			return
		}

		try {
			await navigator.clipboard.writeText(promptText)
			setStatus("AI 提示词已复制到剪贴板")
		} catch {
			const textarea = document.createElement("textarea")
			textarea.value = promptText
			textarea.style.position = "fixed"
			textarea.style.opacity = "0"
			document.body.appendChild(textarea)
			textarea.select()
			document.execCommand("copy")
			document.body.removeChild(textarea)
			setStatus("AI 提示词已复制到剪贴板")
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
		setStatus("当前选择已保存为集合 A")
	}

	const saveSelectionAsB = (): void => {
		setCompareSetB([...new Set(selectedFolderIds)])
		setStatus("当前选择已保存为集合 B")
	}

	const runSelectionCompare = (): void => {
		const rootsA = buildSelectedExportRoots(tree, compareSetA, allNodes)
		const rootsB = buildSelectedExportRoots(tree, compareSetB, allNodes)
		setCompareResult(compareBookmarkSelections(rootsA, rootsB))
		setStatus("对比完成")
	}

	const clearCompareSets = (): void => {
		setCompareSetA([])
		setCompareSetB([])
		setCompareResult(null)
		setStatus("已清空对比集合")
	}

	const renderEntryList = (title: string, items: Array<{ title: string; url: string; path: string }>): JSX.Element => {
		return (
			<div className="compare-block">
				<h3>{title}</h3>
				{items.length ? (
					<ul className="compare-list">
						{items.map((item, index) => (
							<li key={`${title}-${item.title}-${item.url}-${item.path}-${index}`}>
								<div className="compare-item-title">{item.title || "(空标题)"}</div>
								<div className="compare-item-sub">URL: {item.url}</div>
								<div className="compare-item-sub">来源路径: {item.path || "(根目录)"}</div>
							</li>
						))}
					</ul>
				) : (
					<p className="muted">无</p>
				)}
			</div>
		)
	}

	return (
		<main className="app">
			<header className="header">
				<h1>书签结构化整理（Plasmo）</h1>
				<p>支持选中文件夹导出，并生成带 YAML 数据的 AI 分类提示词</p>
			</header>

			<section className="card">
				<h2>操作步骤</h2>
				<div className="pager">
					<button className={`page-btn ${activePage === "select" ? "active" : ""}`} onClick={() => setActivePage("select")}>
						1. 选择范围
					</button>
					<button className={`page-btn ${activePage === "export" ? "active" : ""}`} onClick={() => setActivePage("export")}>
						2. 导出与提示词
					</button>
					<button className={`page-btn ${activePage === "import" ? "active" : ""}`} onClick={() => setActivePage("import")}>
						3. 导入
					</button>
					<button className={`page-btn ${activePage === "compare" ? "active" : ""}`} onClick={() => setActivePage("compare")}>
						4. 选择对比
					</button>
				</div>
			</section>

			{activePage === "select" ? (
				<section className="card">
					<h2>选择导出范围</h2>
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
						<button className="link-btn" onClick={selectAllFolders}>
							全选
						</button>
						<button className="link-btn" onClick={clearFolderSelection}>
							清空
						</button>
						<button className="link-btn" onClick={expandAllFolders}>
							全部展开
						</button>
						<button className="link-btn" onClick={collapseAllFolders}>
							全部收起
						</button>
					</div>
				</section>
			) : null}

			{activePage === "export" ? (
				<>
					<section className="card">
						<h2>导出与提示词</h2>
						<label className="check">
							<input type="checkbox" checked={slimMode} onChange={(e) => setSlimMode(e.target.checked)} />
							<span>精简模式（仅 title/url/children）</span>
						</label>
						<button className="btn primary" onClick={() => void exportJson(false)}>
							导出 JSON
						</button>
						<button className="btn ok" onClick={() => void exportAiPrompt()}>
							生成 AI 分类提示词（含 YAML 数据）
						</button>
					</section>

					<section className="card">
						<h2>AI 提示词预览</h2>
						<div className="controls">
							<button className="link-btn" onClick={() => void copyAiPrompt()}>
								一键复制提示词
							</button>
							<button className="link-btn" onClick={() => void downloadAiPrompt()}>
								下载提示词
							</button>
						</div>
						<pre className="prompt">{promptText || "生成后会显示在这里"}</pre>
					</section>
				</>
			) : null}

			{activePage === "import" ? (
				<section className="card">
					<h2>导入</h2>
					<label className="check">
						<input type="checkbox" checked={autoBackup} onChange={(e) => setAutoBackup(e.target.checked)} />
						<span>导入前自动备份当前书签</span>
					</label>
					<input
						type="file"
						accept="application/json,.json,text/yaml,.yaml,.yml"
						onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
					/>
					<button className="btn warn" onClick={() => void importFromFile()}>
						从文件导入（JSON/YAML）
					</button>
					<textarea
						className="paste-input"
						placeholder="也可以直接粘贴 JSON 或 YAML 到这里再导入"
						value={pastedData}
						onChange={(e) => setPastedData(e.target.value)}
					/>
					<button className="btn warn" onClick={() => void importFromPastedData()}>
						从粘贴内容导入
					</button>
				</section>
			) : null}

			{activePage === "compare" ? (
				<section className="card">
					<h2>选择集对比</h2>
					<p className="muted">先在“选择范围”页调整勾选，再保存到集合 A / B 进行对比。</p>
					<p className="muted">当前集合 A: {compareSetA.length}，集合 B: {compareSetB.length}</p>
					<div className="controls wrap">
						<button className="link-btn" onClick={saveSelectionAsA}>
							将当前选择保存为 A
						</button>
						<button className="link-btn" onClick={saveSelectionAsB}>
							将当前选择保存为 B
						</button>
						<button className="link-btn" onClick={runSelectionCompare}>
							执行 A/B 对比
						</button>
						<button className="link-btn" onClick={clearCompareSets}>
							清空对比集合
						</button>
					</div>

					{compareResult ? (
						<div className="compare-panel">
							<div className="compare-stats-grid">
								<div className="compare-stat">A条目: {compareResult.stats.aEntryCount}</div>
								<div className="compare-stat">B条目: {compareResult.stats.bEntryCount}</div>
								<div className="compare-stat">标题仅A: {compareResult.stats.titleOnlyACount}</div>
								<div className="compare-stat">标题仅B: {compareResult.stats.titleOnlyBCount}</div>
								<div className="compare-stat">URL仅A: {compareResult.stats.urlOnlyACount}</div>
								<div className="compare-stat">URL仅B: {compareResult.stats.urlOnlyBCount}</div>
								<div className="compare-stat">标题交集: {compareResult.stats.titleBothCount}</div>
								<div className="compare-stat">URL交集: {compareResult.stats.urlBothCount}</div>
								<div className="compare-stat wide">同标题不同URL: {compareResult.stats.sameTitleDifferentUrlCount}</div>
							</div>

							<div className="controls wrap compare-filter-row">
								<button
									className={`page-btn ${compareFilter === "all" ? "active" : ""}`}
									onClick={() => setCompareFilter("all")}
								>
									全部
								</button>
								<button
									className={`page-btn ${compareFilter === "title-only" ? "active" : ""}`}
									onClick={() => setCompareFilter("title-only")}
								>
									标题差异
								</button>
								<button
									className={`page-btn ${compareFilter === "url-only" ? "active" : ""}`}
									onClick={() => setCompareFilter("url-only")}
								>
									URL差异
								</button>
								<button
									className={`page-btn ${compareFilter === "title-url-conflict" ? "active" : ""}`}
									onClick={() => setCompareFilter("title-url-conflict")}
								>
									同标题不同URL
								</button>
							</div>

							<div className="compare-result-scroll">
								{compareFilter === "all" || compareFilter === "title-only"
									? renderEntryList("标题仅A（全部）", compareResult.titleOnlyA)
									: null}

								{compareFilter === "all" || compareFilter === "title-only"
									? renderEntryList("标题仅B（全部）", compareResult.titleOnlyB)
									: null}

								{compareFilter === "all" || compareFilter === "url-only"
									? renderEntryList("URL仅A（全部）", compareResult.urlOnlyA)
									: null}

								{compareFilter === "all" || compareFilter === "url-only"
									? renderEntryList("URL仅B（全部）", compareResult.urlOnlyB)
									: null}

								{compareFilter === "all" || compareFilter === "title-url-conflict" ? (
									<div className="compare-block">
										<h3>同标题不同URL（全部）</h3>
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
											<p className="muted">无</p>
										)}
									</div>
								) : null}
							</div>
						</div>
					) : (
						<pre className="status">尚未执行对比</pre>
					)}
				</section>
			) : null}

			<section className="card">
				<h2>状态</h2>
				<pre className="status">{status}</pre>
			</section>
		</main>
	)
}

export default IndexPopup

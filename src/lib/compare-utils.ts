import type { BookmarkEntry, BookmarkNode } from "../types/bookmark"

export type CompareStats = {
  aEntryCount: number
  bEntryCount: number
  titleOnlyACount: number
  titleOnlyBCount: number
  titleBothCount: number
  urlOnlyACount: number
  urlOnlyBCount: number
  urlBothCount: number
  sameUrlDifferentTitleCount: number
  sameTitleDifferentUrlCount: number
}

export type SameTitleDiffItem = {
  title: string
  aEntries: BookmarkEntry[]
  bEntries: BookmarkEntry[]
}

export type SameUrlDiffTitleItem = {
  url: string
  aEntries: BookmarkEntry[]
  bEntries: BookmarkEntry[]
}

export type CompareViewerRowKind = "title-only" | "url-only" | "url-title-change" | "title-url-conflict"

export type CompareViewerRow = {
  id: string
  kind: CompareViewerRowKind
  label: string
  leftItems: BookmarkEntry[]
  rightItems: BookmarkEntry[]
}

export type CompareViewerRowSortBy =
  | "original"
  | "label-asc"
  | "label-desc"
  | "url-asc"
  | "url-desc"
  | "count-asc"
  | "count-desc"

export type RepairCandidate = {
  id: string
  url: string
  aEntries: BookmarkEntry[]
  bEntries: BookmarkEntry[]
}

export type CompareResult = {
  stats: CompareStats
  allEntriesA: BookmarkEntry[]
  allEntriesB: BookmarkEntry[]
  titleOnlyA: BookmarkEntry[]
  titleOnlyB: BookmarkEntry[]
  urlOnlyA: BookmarkEntry[]
  urlOnlyB: BookmarkEntry[]
  sameUrlDifferentTitle: SameUrlDiffTitleItem[]
  sameTitleDifferentUrl: SameTitleDiffItem[]
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function sortEntries(entries: BookmarkEntry[]): BookmarkEntry[] {
  return [...entries].sort((left, right) => {
    const titleCompare = left.title.localeCompare(right.title, "zh-CN")
    if (titleCompare !== 0) {
      return titleCompare
    }

    const urlCompare = left.url.localeCompare(right.url, "en")
    if (urlCompare !== 0) {
      return urlCompare
    }

    return left.path.localeCompare(right.path, "zh-CN")
  })
}

function collectBookmarkEntries(nodes: BookmarkNode[]): BookmarkEntry[] {
  const entries: BookmarkEntry[] = []

  const walk = (node: BookmarkNode, folderPath: string[]): void => {
    if (Array.isArray(node.children)) {
      const nextPath = node.id === "0" ? folderPath : [...folderPath, node.title || "未命名文件夹"]
      for (const child of node.children) {
        walk(child, nextPath)
      }
      return
    }

    if (node.url) {
      entries.push({
        id: node.id,
        title: node.title || "",
        url: node.url,
        path: folderPath.join(" / "),
        pathSegments: [...folderPath],
        dateAdded: node.dateAdded,
        dateGroupModified: node.dateGroupModified,
        parentId: node.parentId,
        index: node.index
      })
    }
  }

  for (const root of nodes) {
    walk(root, [])
  }

  return entries
}

function toMapByTitle(entries: BookmarkEntry[]): Map<string, BookmarkEntry[]> {
  const map = new Map<string, BookmarkEntry[]>()
  for (const entry of entries) {
    const key = normalizeText(entry.title)
    const list = map.get(key) ?? []
    list.push(entry)
    map.set(key, list)
  }
  return map
}

function toMapByUrl(entries: BookmarkEntry[]): Map<string, BookmarkEntry[]> {
  const map = new Map<string, BookmarkEntry[]>()
  for (const entry of entries) {
    const key = normalizeText(entry.url)
    const list = map.get(key) ?? []
    list.push(entry)
    map.set(key, list)
  }
  return map
}

function toSetByUrl(entries: BookmarkEntry[]): Set<string> {
  const urls = new Set<string>()
  for (const entry of entries) {
    urls.add(normalizeText(entry.url))
  }
  return urls
}

function dedupeEntries(entries: BookmarkEntry[]): BookmarkEntry[] {
  const unique = new Map<string, BookmarkEntry>()
  for (const entry of entries) {
    const key = `${normalizeText(entry.title)}|${normalizeText(entry.url)}|${normalizeText(entry.path)}`
    if (!unique.has(key)) {
      unique.set(key, entry)
    }
  }
  return [...unique.values()]
}

function countUniqueTitles(entries: BookmarkEntry[]): number {
  return new Set(entries.map((entry) => normalizeText(entry.title))).size
}

export function compareBookmarkSelections(aRoots: BookmarkNode[], bRoots: BookmarkNode[]): CompareResult {
  const aEntries = collectBookmarkEntries(aRoots)
  const bEntries = collectBookmarkEntries(bRoots)

  const aTitleMap = toMapByTitle(aEntries)
  const bTitleMap = toMapByTitle(bEntries)
  const aUrlMap = toMapByUrl(aEntries)
  const bUrlMap = toMapByUrl(bEntries)
  const aUrlSet = toSetByUrl(aEntries)
  const bUrlSet = toSetByUrl(bEntries)

  const titleKeysA = new Set(aTitleMap.keys())
  const titleKeysB = new Set(bTitleMap.keys())

  const titleOnlyA = [...titleKeysA].filter((key) => !titleKeysB.has(key))
  const titleOnlyB = [...titleKeysB].filter((key) => !titleKeysA.has(key))
  const titleBoth = [...titleKeysA].filter((key) => titleKeysB.has(key))

  const urlOnlyA = [...aUrlSet].filter((url) => !bUrlSet.has(url))
  const urlOnlyB = [...bUrlSet].filter((url) => !aUrlSet.has(url))
  const urlBoth = [...aUrlSet].filter((url) => bUrlSet.has(url))

  const sameUrlDifferentTitle: SameUrlDiffTitleItem[] = []
  for (const urlKey of urlBoth) {
    const aTitles = new Set((aUrlMap.get(urlKey) ?? []).map((item) => normalizeText(item.title)))
    const bTitles = new Set((bUrlMap.get(urlKey) ?? []).map((item) => normalizeText(item.title)))
    const same = aTitles.size === bTitles.size && [...aTitles].every((title) => bTitles.has(title))
    if (!same) {
      sameUrlDifferentTitle.push({
        url: (aUrlMap.get(urlKey)?.[0]?.url || bUrlMap.get(urlKey)?.[0]?.url || urlKey).trim(),
        aEntries: sortEntries(aUrlMap.get(urlKey) ?? []),
        bEntries: sortEntries(bUrlMap.get(urlKey) ?? [])
      })
    }
  }

  const sameTitleDifferentUrl: SameTitleDiffItem[] = []
  for (const titleKey of titleBoth) {
    const aUrls = new Set((aTitleMap.get(titleKey) ?? []).map((item) => normalizeText(item.url)))
    const bUrls = new Set((bTitleMap.get(titleKey) ?? []).map((item) => normalizeText(item.url)))
    const same = aUrls.size === bUrls.size && [...aUrls].every((url) => bUrls.has(url))
    if (!same) {
      const sampleTitle = (aTitleMap.get(titleKey)?.[0]?.title || bTitleMap.get(titleKey)?.[0]?.title || titleKey).trim()
      sameTitleDifferentUrl.push({
        title: sampleTitle || "(空标题)",
        aEntries: sortEntries(aTitleMap.get(titleKey) ?? []),
        bEntries: sortEntries(bTitleMap.get(titleKey) ?? [])
      })
    }
  }

  const rawTitleOnlyAEntries = dedupeEntries(
    titleOnlyA.flatMap((key) =>
      (aTitleMap.get(key) ?? []).map((entry) => ({
        id: entry.id,
        title: entry.title,
        url: entry.url,
        path: entry.path,
        pathSegments: entry.pathSegments,
        dateAdded: entry.dateAdded,
        dateGroupModified: entry.dateGroupModified,
        parentId: entry.parentId,
        index: entry.index
      }))
    )
  )

  const titleOnlyAEntries = rawTitleOnlyAEntries.filter((entry) => !bUrlSet.has(normalizeText(entry.url)))

  const rawTitleOnlyBEntries = dedupeEntries(
    titleOnlyB.flatMap((key) =>
      (bTitleMap.get(key) ?? []).map((entry) => ({
        id: entry.id,
        title: entry.title,
        url: entry.url,
        path: entry.path,
        pathSegments: entry.pathSegments,
        dateAdded: entry.dateAdded,
        dateGroupModified: entry.dateGroupModified,
        parentId: entry.parentId,
        index: entry.index
      }))
    )
  )

  const titleOnlyBEntries = rawTitleOnlyBEntries.filter((entry) => !aUrlSet.has(normalizeText(entry.url)))

  const urlOnlyAEntries = dedupeEntries(
    aEntries.filter((entry) => !bUrlSet.has(normalizeText(entry.url)))
  )

  const urlOnlyBEntries = dedupeEntries(
    bEntries.filter((entry) => !aUrlSet.has(normalizeText(entry.url)))
  )

  return {
    stats: {
      aEntryCount: aEntries.length,
      bEntryCount: bEntries.length,
      titleOnlyACount: countUniqueTitles(titleOnlyAEntries),
      titleOnlyBCount: countUniqueTitles(titleOnlyBEntries),
      titleBothCount: titleBoth.length,
      urlOnlyACount: urlOnlyA.length,
      urlOnlyBCount: urlOnlyB.length,
      urlBothCount: urlBoth.length,
      sameUrlDifferentTitleCount: sameUrlDifferentTitle.length,
      sameTitleDifferentUrlCount: sameTitleDifferentUrl.length
    },
    allEntriesA: dedupeEntries(aEntries),
    allEntriesB: dedupeEntries(bEntries),
    titleOnlyA: titleOnlyAEntries,
    titleOnlyB: titleOnlyBEntries,
    urlOnlyA: urlOnlyAEntries,
    urlOnlyB: urlOnlyBEntries,
    sameUrlDifferentTitle,
    sameTitleDifferentUrl
  }
}

function buildLeftOnlyRows(kind: CompareViewerRowKind, entries: BookmarkEntry[], groupBy: "title" | "url"): CompareViewerRow[] {
  const grouped = new Map<string, BookmarkEntry[]>()

  for (const entry of entries) {
    const key = groupBy === "title" ? normalizeText(entry.title) : normalizeText(entry.url)
    const list = grouped.get(key) ?? []
    list.push(entry)
    grouped.set(key, list)
  }

  return [...grouped.entries()].map(([key, items]) => ({
    id: `${kind}-left-${key}`,
    kind,
    label: groupBy === "title" ? items[0]?.title || "" : items[0]?.url || "",
    leftItems: sortEntries(items),
    rightItems: []
  }))
}

function buildRightOnlyRows(kind: CompareViewerRowKind, entries: BookmarkEntry[], groupBy: "title" | "url"): CompareViewerRow[] {
  const grouped = new Map<string, BookmarkEntry[]>()

  for (const entry of entries) {
    const key = groupBy === "title" ? normalizeText(entry.title) : normalizeText(entry.url)
    const list = grouped.get(key) ?? []
    list.push(entry)
    grouped.set(key, list)
  }

  return [...grouped.entries()].map(([key, items]) => ({
    id: `${kind}-right-${key}`,
    kind,
    label: groupBy === "title" ? items[0]?.title || "" : items[0]?.url || "",
    leftItems: [],
    rightItems: sortEntries(items)
  }))
}

export function buildCompareViewerRows(result: CompareResult): CompareViewerRow[] {
  const rows = [
    ...buildLeftOnlyRows("title-only", result.titleOnlyA, "title"),
    ...buildRightOnlyRows("title-only", result.titleOnlyB, "title"),
    ...buildLeftOnlyRows("url-only", result.urlOnlyA, "url"),
    ...buildRightOnlyRows("url-only", result.urlOnlyB, "url"),
    ...result.sameUrlDifferentTitle.map((item, index) => ({
      id: `url-title-change-${normalizeText(item.url)}-${index}`,
      kind: "url-title-change" as const,
      label: item.url,
      leftItems: sortEntries(item.aEntries),
      rightItems: sortEntries(item.bEntries)
    })),
    ...result.sameTitleDifferentUrl.map((item, index) => ({
      id: `title-url-conflict-${normalizeText(item.title)}-${index}`,
      kind: "title-url-conflict" as const,
      label: item.title,
      leftItems: sortEntries(item.aEntries),
      rightItems: sortEntries(item.bEntries)
    }))
  ]

  return rows.sort((left, right) => left.label.localeCompare(right.label, "zh-CN"))
}

export function sortCompareViewerRows(rows: CompareViewerRow[], sortBy: CompareViewerRowSortBy): CompareViewerRow[] {
  const sorted = [...rows]
  switch (sortBy) {
    case "label-asc":
      sorted.sort((a, b) => (a.label || "").localeCompare(b.label || "", "zh-CN"))
      break
    case "label-desc":
      sorted.sort((a, b) => (b.label || "").localeCompare(a.label || "", "zh-CN"))
      break
    case "url-asc":
      sorted.sort((a, b) => {
        const aUrl = (a.leftItems[0]?.url || a.rightItems[0]?.url) || ""
        const bUrl = (b.leftItems[0]?.url || b.rightItems[0]?.url) || ""
        return aUrl.localeCompare(bUrl, "zh-CN")
      })
      break
    case "url-desc":
      sorted.sort((a, b) => {
        const aUrl = (a.leftItems[0]?.url || a.rightItems[0]?.url) || ""
        const bUrl = (b.leftItems[0]?.url || b.rightItems[0]?.url) || ""
        return bUrl.localeCompare(aUrl, "zh-CN")
      })
      break
    case "count-asc":
      sorted.sort((a, b) => (a.leftItems.length + a.rightItems.length) - (b.leftItems.length + b.rightItems.length))
      break
    case "count-desc":
      sorted.sort((a, b) => (b.leftItems.length + b.rightItems.length) - (a.leftItems.length + a.rightItems.length))
      break
    case "original":
    default:
      break
  }
  return sorted
}

export function buildRepairCandidates(result: CompareResult): RepairCandidate[] {
  const aUrlMap = toMapByUrl(result.allEntriesA)
  const bUrlMap = toMapByUrl(result.allEntriesB)

  return [...aUrlMap.keys()]
    .filter((key) => bUrlMap.has(key))
    .map((urlKey) => {
      const aEntries = sortEntries(
        (aUrlMap.get(urlKey) ?? []).filter((entry) => typeof entry.dateAdded === "number" && entry.dateAdded > 0)
      )
      const bEntries = sortEntries(bUrlMap.get(urlKey) ?? [])

      return {
        id: `repair-${urlKey}`,
        url: aEntries[0]?.url || bEntries[0]?.url || urlKey,
        aEntries,
        bEntries
      }
    })
    .filter((item) => item.aEntries.length > 0 && item.bEntries.length > 0)
    .sort((left, right) => left.url.localeCompare(right.url, "zh-CN"))
}

export function normalizeRepairSourceSelection(
  candidates: RepairCandidate[],
  current: Record<string, string>
): Record<string, string> {
  if (candidates.length === 0) {
    return Object.keys(current).length === 0 ? current : {}
  }

  const next = { ...current }
  let changed = false
  const validIds = new Set(candidates.flatMap((candidate) => candidate.bEntries.map((entry) => entry.id)))

  for (const key of Object.keys(next)) {
    if (!validIds.has(key)) {
      delete next[key]
      changed = true
    }
  }

  for (const candidate of candidates) {
    for (const target of candidate.bEntries) {
      const targetKey = target.id
      const currentSourceId = next[targetKey]
      if (!currentSourceId || !candidate.aEntries.some((entry) => entry.id === currentSourceId)) {
        next[targetKey] = candidate.aEntries[0].id
        changed = true
      }
    }
  }

  return changed ? next : current
}

export function buildRepairedEntriesFromSelection(
  allEntriesB: BookmarkEntry[],
  candidates: RepairCandidate[],
  selectedSourceIds: Record<string, string>
): BookmarkEntry[] {
  const selectedSourceDateByBEntryId = new Map<string, number | undefined>()

  for (const candidate of candidates) {
    for (const target of candidate.bEntries) {
      const selectedSourceId = selectedSourceIds[target.id] ?? candidate.aEntries[0].id
      const source = candidate.aEntries.find((entry) => entry.id === selectedSourceId) ?? candidate.aEntries[0]
      selectedSourceDateByBEntryId.set(target.id, source.dateAdded)
    }
  }

  return allEntriesB.map((entry) => {
    const mappedDateAdded = selectedSourceDateByBEntryId.get(entry.id)
    if (typeof mappedDateAdded !== "number") {
      return entry
    }

    return {
      ...entry,
      dateAdded: mappedDateAdded
    }
  })
}

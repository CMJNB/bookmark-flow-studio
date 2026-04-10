import { parse as parseYaml } from "yaml"

import type { ExportNode } from "../types/bookmark"

export function parseStructuredInput(rawText: string): unknown {
  const text = rawText.trim()
  if (!text) {
    throw new Error("导入内容为空")
  }

  try {
    return JSON.parse(text)
  } catch {
    // 非 JSON 时再尝试 YAML。
  }

  const yamlParsed = parseYaml(text)
  if (yamlParsed === null || yamlParsed === undefined) {
    throw new Error("无法解析输入内容，请检查 JSON/YAML 格式")
  }
  return yamlParsed
}

export function normalizeImportData(parsed: unknown): ExportNode[] {
  if (Array.isArray(parsed)) {
    return parsed as ExportNode[]
  }

  if (parsed && typeof parsed === "object") {
    const typed = parsed as {
      children?: ExportNode[]
      organized_bookmarks?: ExportNode[]
      bookmarks?: ExportNode[]
    }

    const maybeOrganized = typed.organized_bookmarks
    if (Array.isArray(maybeOrganized)) {
      return maybeOrganized
    }

    const maybeBookmarks = typed.bookmarks
    if (Array.isArray(maybeBookmarks)) {
      return maybeBookmarks
    }

    const maybeChildren = typed.children
    if (Array.isArray(maybeChildren)) {
      return maybeChildren
    }

    return [parsed as ExportNode]
  }

  throw new Error("JSON 格式不正确，必须是对象或数组")
}

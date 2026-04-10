import { DEFAULT_PROMPT_TEMPLATE } from "./prompt-utils"
import type { AppSettings, PromptTemplate, PromptTemplateState, ThemeMode } from "../types/settings"

const STORAGE_KEY = "bookmark_structurer_settings"
const TEMPLATE_STORAGE_KEY = "bookmark_structurer_prompt_templates"
const HASH_MAP_STORAGE_KEY = "bookmark_structurer_hash_map"

export const defaultSettings: AppSettings = {
  theme: "system",
  language: "zh-CN"
}

const defaultTemplate: PromptTemplate = {
  id: "default-template",
  name: "默认模板",
  content: DEFAULT_PROMPT_TEMPLATE,
  updatedAt: Date.now()
}

export const defaultPromptTemplateState: PromptTemplateState = {
  selectedTemplateId: defaultTemplate.id,
  templates: [defaultTemplate]
}

function applyThemeValue(value: Exclude<ThemeMode, "system">): void {
  document.documentElement.setAttribute("data-theme", value)
}

export function applyTheme(theme: ThemeMode): void {
  if (theme === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    applyThemeValue(isDark ? "dark" : "light")
    return
  }

  applyThemeValue(theme)
}

export async function loadSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const settings = (result[STORAGE_KEY] as AppSettings | undefined) ?? defaultSettings
      resolve({
        theme: settings.theme ?? defaultSettings.theme,
        language: settings.language ?? defaultSettings.language
      })
    })
  })
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

function normalizeTemplate(item: unknown): PromptTemplate | null {
  if (!item || typeof item !== "object") {
    return null
  }

  const obj = item as Record<string, unknown>
  if (typeof obj.id !== "string" || typeof obj.name !== "string" || typeof obj.content !== "string") {
    return null
  }

  return {
    id: obj.id,
    name: obj.name.trim() || "未命名模板",
    content: obj.content,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now()
  }
}

export function normalizePromptTemplateState(input: unknown): PromptTemplateState {
  if (!input || typeof input !== "object") {
    return defaultPromptTemplateState
  }

  const obj = input as Record<string, unknown>
  const templates = Array.isArray(obj.templates)
    ? obj.templates.map((item) => normalizeTemplate(item)).filter((item): item is PromptTemplate => item !== null)
    : []

  const safeTemplates = templates.length ? templates : defaultPromptTemplateState.templates
  const selectedTemplateId =
    typeof obj.selectedTemplateId === "string" && safeTemplates.some((item) => item.id === obj.selectedTemplateId)
      ? obj.selectedTemplateId
      : safeTemplates[0].id

  return {
    selectedTemplateId,
    templates: safeTemplates
  }
}

export async function loadPromptTemplateState(): Promise<PromptTemplateState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([TEMPLATE_STORAGE_KEY], (result) => {
      const state = normalizePromptTemplateState(result[TEMPLATE_STORAGE_KEY])
      resolve(state)
    })
  })
}

export async function savePromptTemplateState(state: PromptTemplateState): Promise<void> {
  const normalized = normalizePromptTemplateState(state)
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [TEMPLATE_STORAGE_KEY]: normalized }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

export async function loadHashMap(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.get([HASH_MAP_STORAGE_KEY], (result) => {
      const map = result[HASH_MAP_STORAGE_KEY]
      resolve(map && typeof map === "object" ? (map as Record<string, string>) : {})
    })
  })
}

export async function saveHashMap(map: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HASH_MAP_STORAGE_KEY]: map }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

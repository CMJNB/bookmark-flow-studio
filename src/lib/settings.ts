import {
  DEFAULT_HASH_PROMPT_TEMPLATE,
  DEFAULT_INCREMENTAL_PROMPT_TEMPLATE,
  DEFAULT_PROMPT_TEMPLATE
} from "./prompt-utils"
import type {
  AppSettings,
  PromptDataMode,
  PromptMode,
  PromptTemplate,
  PromptTemplateState,
  ThemeMode
} from "../types/settings"

const STORAGE_KEY = "bookmark_structurer_settings"
const TEMPLATE_STORAGE_KEY = "bookmark_structurer_prompt_templates"
const HASH_MAP_STORAGE_KEY = "bookmark_structurer_hash_map"

export const defaultSettings: AppSettings = {
  theme: "system",
  language: "zh-CN"
}

const defaultUrlTemplate: PromptTemplate = {
  id: "default-template-url",
  mode: "url",
  name: "默认 URL 模板",
  content: DEFAULT_PROMPT_TEMPLATE,
  updatedAt: Date.now()
}

const defaultHashTemplate: PromptTemplate = {
  id: "default-template-hash",
  mode: "hash",
  name: "默认哈希模板",
  content: DEFAULT_HASH_PROMPT_TEMPLATE,
  updatedAt: Date.now()
}

const defaultIncrementalTemplate: PromptTemplate = {
  id: "default-template-incremental",
  mode: "incremental",
  name: "默认增量更新模板",
  content: DEFAULT_INCREMENTAL_PROMPT_TEMPLATE,
  updatedAt: Date.now()
}

function createDefaultTemplateState(): PromptTemplateState {
  return {
    selectedTemplateIds: {
      url: defaultUrlTemplate.id,
      hash: defaultHashTemplate.id,
      incremental: defaultIncrementalTemplate.id
    },
    exportMode: "url",
    incrementalSetAMode: "url",
    incrementalSetBMode: "url",
    templates: [defaultUrlTemplate, defaultHashTemplate, defaultIncrementalTemplate]
  }
}

export const defaultPromptTemplateState: PromptTemplateState = createDefaultTemplateState()

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

function normalizePromptMode(value: unknown, fallback: PromptMode): PromptMode {
  return value === "url" || value === "hash" || value === "incremental" ? value : fallback
}

function normalizePromptDataMode(value: unknown, fallback: PromptDataMode): PromptDataMode {
  return value === "url" || value === "hash" ? value : fallback
}

function normalizeTemplate(item: unknown, fallbackMode: PromptMode): PromptTemplate | null {
  if (!item || typeof item !== "object") {
    return null
  }

  const obj = item as Record<string, unknown>
  if (typeof obj.id !== "string" || typeof obj.name !== "string" || typeof obj.content !== "string") {
    return null
  }

  return {
    id: obj.id,
    mode: normalizePromptMode(obj.mode, fallbackMode),
    name: obj.name.trim() || "未命名模板",
    content: obj.content,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now()
  }
}

export function normalizePromptTemplateState(input: unknown): PromptTemplateState {
  const defaults = createDefaultTemplateState()

  if (!input || typeof input !== "object") {
    return defaults
  }

  const obj = input as Record<string, unknown>
  const templates = Array.isArray(obj.templates)
    ? obj.templates
        .map((item) => normalizeTemplate(item, "url"))
        .filter((item): item is PromptTemplate => item !== null)
    : []

  const seeded = templates.length ? [...templates] : []

  const ensureModeDefault = (mode: PromptMode, fallback: PromptTemplate): void => {
    if (!seeded.some((item) => item.mode === mode)) {
      seeded.push({ ...fallback })
    }
  }

  ensureModeDefault("url", defaultUrlTemplate)
  ensureModeDefault("hash", defaultHashTemplate)
  ensureModeDefault("incremental", defaultIncrementalTemplate)

  const legacySelectedId = typeof obj.selectedTemplateId === "string" ? obj.selectedTemplateId : null
  const selectedTemplateIdsRaw = (obj.selectedTemplateIds as Record<string, unknown> | undefined) ?? {}

  const resolveSelectedId = (mode: PromptMode): string => {
    const candidate = selectedTemplateIdsRaw[mode]
    if (typeof candidate === "string" && seeded.some((item) => item.id === candidate && item.mode === mode)) {
      return candidate
    }

    if (legacySelectedId && seeded.some((item) => item.id === legacySelectedId && item.mode === mode)) {
      return legacySelectedId
    }

    return seeded.find((item) => item.mode === mode)?.id ?? defaults.selectedTemplateIds[mode]
  }

  return {
    selectedTemplateIds: {
      url: resolveSelectedId("url"),
      hash: resolveSelectedId("hash"),
      incremental: resolveSelectedId("incremental")
    },
    exportMode: normalizePromptMode(obj.exportMode, defaults.exportMode),
    incrementalSetAMode: normalizePromptDataMode(obj.incrementalSetAMode, defaults.incrementalSetAMode),
    incrementalSetBMode: normalizePromptDataMode(obj.incrementalSetBMode, defaults.incrementalSetBMode),
    templates: seeded
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

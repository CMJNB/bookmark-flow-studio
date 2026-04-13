export type ThemeMode = "light" | "dark" | "system"
export type AppLanguage = "zh-CN" | "en-US"

export type AppSettings = {
  theme: ThemeMode
  language: AppLanguage
}

export type PromptMode = "url" | "hash" | "incremental"
export type PromptDataMode = "url" | "hash"

export type PromptTemplate = {
  id: string
  name: string
  content: string
  mode: PromptMode
  updatedAt: number
}

export type PromptTemplateState = {
  selectedTemplateIds: Record<PromptMode, string>
  exportMode: PromptMode
  incrementalSetAMode: PromptDataMode
  incrementalSetBMode: PromptDataMode
  templates: PromptTemplate[]
}

export type AppConfigSnapshot = {
  version: 1
  settings: AppSettings
  slimMode: boolean
  autoBackup: boolean
  promptTemplates: PromptTemplateState
}

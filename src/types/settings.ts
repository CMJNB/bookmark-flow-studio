export type ThemeMode = "light" | "dark" | "system"
export type AppLanguage = "zh-CN" | "en-US"

export type AppSettings = {
  theme: ThemeMode
  language: AppLanguage
}

export type PromptTemplate = {
  id: string
  name: string
  content: string
  updatedAt: number
}

export type PromptTemplateState = {
  selectedTemplateId: string
  templates: PromptTemplate[]
}

export type AppConfigSnapshot = {
  version: 1
  settings: AppSettings
  slimMode: boolean
  autoBackup: boolean
  promptTemplates: PromptTemplateState
}

import type { AppSettings, ThemeMode } from "../types/settings"

const STORAGE_KEY = "bookmark_structurer_settings"

export const defaultSettings: AppSettings = {
  theme: "system",
  language: "zh-CN"
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

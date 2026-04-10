import { useEffect, useState } from "react"

import { applyTheme, defaultSettings, loadSettings } from "./settings"
import { useStorageListener } from "./use-storage-listener"
import type { AppSettings } from "../types/settings"

export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  useEffect(() => {
    void (async () => {
      const loaded = await loadSettings()
      setSettings(loaded)
      applyTheme(loaded.theme)
    })()
  }, [])

  useStorageListener(async () => {
    const loaded = await loadSettings()
    setSettings(loaded)
    applyTheme(loaded.theme)
  })

  useEffect(() => {
    if (settings.theme !== "system") {
      return undefined
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme("system")
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [settings.theme])

  return settings
}

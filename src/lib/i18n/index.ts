import type { AppLanguage } from "../../types/settings"
import zhCN from "./zh-CN"
import enUS from "./en-US"

export type I18nDict = Record<string, string>

/** 各语言在自身文字中的名称，固定常量，不参与翻译 */
export const LANG_NAMES: Record<AppLanguage, string> = {
  "zh-CN": "简体中文",
  "en-US": "English"
}

const dictMap: Record<AppLanguage, I18nDict> = {
  "zh-CN": zhCN,
  "en-US": enUS
}

export function t(lang: AppLanguage, key: string): string {
  return dictMap[lang][key] ?? key
}

export function tf(lang: AppLanguage, key: string, vars: Record<string, string | number>): string {
  let template = t(lang, key)
  for (const [name, value] of Object.entries(vars)) {
    template = template.replaceAll(`{${name}}`, String(value))
  }
  return template
}

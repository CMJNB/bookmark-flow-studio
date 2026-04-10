import type { CompareResult } from "./compare-utils"

const COMPARE_VIEWER_STATE_KEY = "bookmark_structurer_compare_viewer"

export type CompareViewerState = {
  compareResult: CompareResult
  compareSetACount: number
  compareSetBCount: number
  createdAt: number
}

export async function saveCompareViewerState(state: CompareViewerState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [COMPARE_VIEWER_STATE_KEY]: state }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve()
    })
  })
}

export async function loadCompareViewerState(): Promise<CompareViewerState | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([COMPARE_VIEWER_STATE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve((result[COMPARE_VIEWER_STATE_KEY] as CompareViewerState | undefined) ?? null)
    })
  })
}
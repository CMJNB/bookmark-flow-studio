import { useEffect, useRef } from "react"

/**
 * Custom hook that subscribes to chrome.storage.local changes.
 * The callback is called whenever any local storage key changes.
 * Internally uses a ref so the latest callback is always called without re-subscribing.
 */
export function useStorageListener(
  callback: (changes: Record<string, chrome.storage.StorageChange>) => void | Promise<void>
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") {
        return
      }

      void callbackRef.current(changes)
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])
}

import type { BookmarkNode, CreateBookmarkInput } from "../types/bookmark"

export function getTree(): Promise<BookmarkNode[]> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(nodes ?? [])
    })
  })
}

export function downloadTextFile(fileName: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)

    chrome.downloads.download(
      {
        url,
        filename: fileName,
        saveAs: true
      },
      (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 5000)

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!downloadId) {
          reject(new Error("下载未启动"))
          return
        }
        resolve()
      }
    )
  })
}

export function createBookmark(input: CreateBookmarkInput): Promise<BookmarkNode> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(input, (node) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(node)
    })
  })
}

export function openPopupWindow(url: string, width = 1180, height = 820): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.windows.create(
      {
        url,
        type: "popup",
        width,
        height,
        focused: true
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        resolve()
      }
    )
  })
}

export function updateBookmark(id: string, changes: { title?: string; url?: string }): Promise<BookmarkNode> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(id, changes, (node) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(node)
    })
  })
}

export function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number }
): Promise<BookmarkNode> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(id, destination, (node) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(node)
    })
  })
}

export function removeBookmarkTree(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

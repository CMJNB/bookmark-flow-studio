export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode

export type ExportNode = {
  title: string
  url?: string
  children?: ExportNode[]
}

export type FolderTreeNode = {
  id: string
  title: string
  children: FolderTreeNode[]
}

export type PageKey = "select" | "export" | "import" | "compare" | "settings"

export type CreateBookmarkInput = {
  parentId?: string
  index?: number
  title?: string
  url?: string
}

export type BookmarkEntry = {
  title: string
  url: string
  path: string
}

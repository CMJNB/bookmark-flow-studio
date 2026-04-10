# Bookmark Flow Studio

English | [简体中文](README.zh-CN.md)

A Chrome extension built with Plasmo for bookmark export, AI prompt generation, import, comparison, and tree-style editing.

## Key Features

- Read the full Chrome bookmark tree.
- Select folders and export JSON in full/slim modes.
- Generate AI prompts with YAML bookmark data.
- Manage multiple prompt templates and switch active template.
- Generate hash-mode prompts and resolve hash-based imports.
- Import JSON/YAML to rebuild bookmark structures.
- Optional backup before import.
- A/B selection comparison in a floating viewer.
- Global compare search page with filtering and sorting.
- Bookmark editor page with tree editing:
  - Search and locate
  - Open bookmark links safely
  - Create folder/bookmark
  - Multi-select, drag and drop
  - Copy/cut/paste and batch operations
- Bilingual UI (zh-CN / en-US) and theme support (light/dark/system).

## Tech Stack

- Plasmo (Manifest V3)
- React 18 + TypeScript
- react-arborist (tree editor)
- yaml

## Development

1. Install dependencies

    ```bash
    npm install
    ```

2. Start development build

    ```bash
    npm run dev
    ```

3. Open `chrome://extensions/`, enable Developer Mode, then load the generated directory (usually `build/chrome-mv3-dev`).

## Build and Package

Build production assets:

```bash
npm run build
```

Create extension package:

```bash
npm run package
```

## Permissions

- `bookmarks`
- `downloads`
- `storage`

## Import Data Format

Array form:

```json
[
  {
    "title": "Tech",
    "children": [{ "title": "MDN", "url": "https://developer.mozilla.org" }]
  }
]
```

Object form with `children`:

```json
{
  "title": "Root",
  "children": [{ "title": "Google", "url": "https://www.google.com" }]
}
```

## Notes

- Import creates a new root folder to avoid destructive overwrite.
- If auto backup is enabled, a full bookmark JSON backup is downloaded before import.

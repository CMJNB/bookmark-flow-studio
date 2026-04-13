# Bookmark Flow Studio

English | [简体中文](README.zh-CN.md)

A productivity-focused Chrome extension for heavy bookmark workflows: export, import, A/B compare, timestamp repair, template-based AI prompts, and tree-style batch editing in one place.

## Use Cases

- Clean up and reorganize bookmarks after browser migration.
- Feed bookmark structures into AI using reusable templates.
- Compare A/B sets and repair timestamp fields in standard HTML bookmarks.
- Perform tree editing and batch operations directly inside the extension.

## Core Capabilities

### 1. Export and Prompting

- Read the full Chrome bookmark tree.
- Select folders and export JSON in full/slim modes.
- Generate AI prompts with YAML bookmark payloads.
- Manage, edit, and switch prompt templates.
- Support hash-mode prompts and hash-based import parsing.

### 2. Import and Safety

- Import JSON/YAML and rebuild bookmark structures.
- Optional automatic backup before import.
- Import into a new root folder by default to avoid destructive overwrite.

### 3. A/B Compare and Search

- Compare selected A/B sets.
- Sort and filter compare results.
- Dedicated compare search page for quick location.
- Added-time display in key bookmark-item views for better source and recency judgment.

### 4. Standard HTML Timestamp Repair

- Timestamp repair is now a dedicated page and no longer occupies the default compare view.
- Uses B as the target set and only updates timestamp fields for matched URLs.
- Preserves B order in exported output.
- Supports per-B-item source selection when the same URL appears multiple times in A.

### 5. Tree Editor

- Search and locate nodes.
- Open bookmark links safely.
- Create folders/bookmarks.
- Multi-select, drag and drop, copy/cut/paste, and batch actions.

### 6. UX and i18n

- Bilingual UI (zh-CN / en-US).
- Theme support: light, dark, and system.

## Tech Stack

- Plasmo (Manifest V3)
- React 18 + TypeScript
- react-arborist
- yaml

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Start development mode

```bash
npm run dev
```

3. Open `chrome://extensions/`, enable Developer Mode, then load the generated folder (usually `build/chrome-mv3-dev`).

## Build and Package

```bash
npm run build
npm run package
```

## Permissions

- `bookmarks`: read/write bookmark tree.
- `downloads`: export and backup download.
- `storage`: persist templates and page state.

## Import Format Examples

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

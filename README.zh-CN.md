# 书签流整理工坊

[English](README.md) | 简体中文

一个基于 Plasmo 的 Chrome 扩展，用于书签导出、AI 提示词生成、导入、对比与树形编辑。

## 核心功能

- 读取 Chrome 全量书签树。
- 按文件夹选择导出，支持完整/精简 JSON。
- 生成包含 YAML 书签数据的 AI 提示词。
- 支持多模板管理与一键切换生效模板。
- 支持哈希模式提示词与哈希导入解析。
- 支持 JSON/YAML 导入并重建书签结构。
- 导入前可自动备份。
- 支持 A/B 选择集对比（悬浮查看）。
- 支持全局对比搜索页，含筛选与排序。
- 内置书签编辑页（树形编辑）：
  - 搜索与定位
  - 安全打开链接
  - 新建文件夹/书签
  - 多选与拖拽
  - 复制/剪切/粘贴与批量操作
- 支持中英文界面（zh-CN / en-US）与主题切换（浅色/深色/跟随系统）。

## 技术栈

- Plasmo（Manifest V3）
- React 18 + TypeScript
- react-arborist（树编辑）
- yaml

## 本地开发

1. 安装依赖

    ```bash
    npm install
    ```

2. 启动开发构建

    ```bash
    npm run dev
    ```

3. 打开 `chrome://extensions/`，开启开发者模式，加载生成目录（通常是 `build/chrome-mv3-dev`）。

## 构建与打包

生产构建：

```bash
npm run build
```

打包扩展：

```bash
npm run package
```

## 权限

- `bookmarks`
- `downloads`
- `storage`

## 导入数据格式

数组结构：

```json
[
  {
    "title": "技术",
    "children": [{ "title": "MDN", "url": "https://developer.mozilla.org" }]
  }
]
```

对象结构（含 `children`）：

```json
{
  "title": "Root",
  "children": [{ "title": "Google", "url": "https://www.google.com" }]
}
```

## 说明

- 导入会创建新的根目录，避免直接覆盖原书签。
- 若启用自动备份，导入前会先下载完整书签 JSON 备份。

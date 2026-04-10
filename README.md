# 书签结构化整理扩展（Plasmo + Manifest V3）

## 功能

- 读取 Chrome 全量书签树
- 支持勾选指定收藏夹（文件夹）导出
- 一键导出 JSON（完整模式 / 精简模式）
- 生成可直接喂给 AI 的分类提示词（包含 YAML 书签数据）
- 导入 AI 整理后的 JSON 并重建文件夹与书签
- 导入前提醒，并支持自动备份当前书签

## 本地开发

1. 安装依赖

   npm install

2. 开发模式

   npm run dev

3. 打开 Chrome 扩展页 chrome://extensions/，加载 Plasmo 生成目录（通常为 build/chrome-mv3-dev）

## 构建

npm run build

构建产物通常在 build/chrome-mv3-prod。

## AI 导入 JSON 结构建议

可以是数组结构：

[
  {
    "title": "技术",
    "children": [
      { "title": "MDN", "url": "https://developer.mozilla.org" }
    ]
  }
]

也可以是对象结构（带 children）：

{
  "title": "Root",
  "children": [
    { "title": "Google", "url": "https://www.google.com" }
  ]
}

## 提示

- 为避免误操作，导入会创建一个新的根目录，例如 AI 整理导入 2026/04/10 13:30:00。
- 若开启自动备份，会先下载一份完整书签 JSON 备份文件。

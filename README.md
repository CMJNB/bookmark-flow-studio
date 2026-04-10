# 书签结构化整理扩展（Manifest V3）

## 功能

- 读取 Chrome 全量书签树（`chrome.bookmarks.getTree`）
- 一键导出 JSON（完整模式 / 精简模式）
- 导入 AI 整理后的 JSON 并重建文件夹与书签
- 导入前提醒，并支持自动备份当前书签

## 使用方式

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”，选择本项目目录
4. 点击扩展图标，打开弹窗界面

## JSON 结构建议

可以是数组：

```json
[
  {
    "title": "技术",
    "children": [
      { "title": "MDN", "url": "https://developer.mozilla.org" }
    ]
  }
]
```

也可以是对象（带 children）：

```json
{
  "title": "Root",
  "children": [
    { "title": "Google", "url": "https://www.google.com" }
  ]
}
```

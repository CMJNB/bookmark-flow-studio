const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileInput = document.getElementById("importFile");
const slimModeInput = document.getElementById("slimMode");
const autoBackupInput = document.getElementById("autoBackup");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

function formatDateForFileName(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function getBookmarksTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(nodes || []);
    });
  });
}

function createDownload(blob, fileName) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download(
      {
        url,
        filename: fileName,
        saveAs: true
      },
      (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!downloadId) {
          reject(new Error("下载未启动。"));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

function toSlimNode(node) {
  const base = {
    title: node.title || ""
  };

  if (node.url) {
    base.url = node.url;
  }

  if (Array.isArray(node.children)) {
    base.children = node.children.map(toSlimNode);
  }

  return base;
}

function toFullNode(node) {
  const base = {
    id: node.id,
    title: node.title || "",
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    index: node.index,
    parentId: node.parentId
  };

  if (Array.isArray(node.children)) {
    base.children = node.children.map(toFullNode);
  }

  return base;
}

async function exportBookmarks({ slimMode, backup = false }) {
  const tree = await getBookmarksTree();
  const data = slimMode ? tree.map(toSlimNode) : tree.map(toFullNode);
  const json = JSON.stringify(data, null, 2);
  const stamp = formatDateForFileName(new Date());
  const modeName = slimMode ? "slim" : "full";
  const prefix = backup ? "bookmarks-backup" : "bookmarks-export";
  const fileName = `${prefix}-${modeName}-${stamp}.json`;
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  await createDownload(blob, fileName);
  return { fileName, count: tree.length };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsText(file, "utf-8");
  });
}

function normalizeImportData(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.children)) {
      return parsed.children;
    }
    return [parsed];
  }

  throw new Error("JSON 格式不正确：必须是对象或数组。");
}

function getDefaultImportParentId(tree) {
  const root = Array.isArray(tree) ? tree[0] : undefined;
  if (root && Array.isArray(root.children) && root.children.length > 0) {
    const bookmarksBar = root.children.find((node) => node.id === "1");
    if (bookmarksBar) {
      return bookmarksBar.id;
    }
    return root.children[0].id;
  }
  return "1";
}

async function createNodeRecursive(parentId, item) {
  if (!item || typeof item !== "object") {
    return;
  }

  const title = typeof item.title === "string" ? item.title : "未命名";
  const url = typeof item.url === "string" ? item.url.trim() : "";

  if (url) {
    await new Promise((resolve, reject) => {
      chrome.bookmarks.create(
        {
          parentId,
          title,
          url
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });
    return;
  }

  const folder = await new Promise((resolve, reject) => {
    chrome.bookmarks.create(
      {
        parentId,
        title
      },
      (newFolder) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(newFolder);
      }
    );
  });

  if (Array.isArray(item.children)) {
    for (const child of item.children) {
      await createNodeRecursive(folder.id, child);
    }
  }
}

async function importBookmarksFromJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("JSON 解析失败，请检查格式。");
  }

  const items = normalizeImportData(parsed);
  const tree = await getBookmarksTree();
  const importParentId = getDefaultImportParentId(tree);
  const rootFolder = await new Promise((resolve, reject) => {
    const title = `AI 整理导入 ${new Date().toLocaleString("zh-CN")}`;
    chrome.bookmarks.create({ parentId: importParentId, title }, (node) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(node);
    });
  });

  for (const item of items) {
    await createNodeRecursive(rootFolder.id, item);
  }

  return { importedCount: items.length, folderTitle: rootFolder.title };
}

exportBtn.addEventListener("click", async () => {
  const slimMode = slimModeInput.checked;
  setStatus("正在导出书签，请稍候...");

  try {
    const result = await exportBookmarks({ slimMode });
    setStatus(`导出完成\n文件名: ${result.fileName}\n根节点数: ${result.count}`);
  } catch (error) {
    setStatus(`导出失败\n${error.message}`);
  }
});

importBtn.addEventListener("click", async () => {
  const file = importFileInput.files?.[0];
  if (!file) {
    setStatus("请先选择要导入的 JSON 文件。");
    return;
  }

  const confirmed = window.confirm(
    "导入前提醒：建议先备份当前书签。\n\n点击“确定”继续，点击“取消”终止。"
  );

  if (!confirmed) {
    setStatus("已取消导入操作。");
    return;
  }

  try {
    setStatus("正在准备导入...");

    if (autoBackupInput.checked) {
      setStatus("正在自动备份当前书签...");
      await exportBookmarks({ slimMode: false, backup: true });
    }

    const jsonText = await readFileAsText(file);
    setStatus("正在导入书签结构，请稍候...");
    const result = await importBookmarksFromJson(jsonText);
    setStatus(
      `导入完成\n导入到目录: ${result.folderTitle}\n顶层项目数: ${result.importedCount}`
    );
  } catch (error) {
    setStatus(`导入失败\n${error.message}`);
  }
});

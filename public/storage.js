export const standalone = globalThis.__PLANNER_STANDALONE__ === true;
export const savedLabel = standalone ? '草稿已保存 · 本浏览器' : '已保存到本地';
let draftDatabase;

function openDraftDatabase() {
  if (!draftDatabase) {
    draftDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('system-planner-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return draftDatabase;
}

export async function loadProject() {
  if (!standalone) {
    const response = await fetch('/api/project');
    if (!response.ok) throw new Error('无法读取本地项目');
    return response.json();
  }
  const database = await openDraftDatabase();
  const draft = await new Promise((resolve, reject) => {
    const request = database.transaction('drafts').objectStore('drafts').get(location.pathname);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return draft || JSON.parse(document.getElementById('standalone-seed').textContent);
}

export async function persistProject(project) {
  if (!standalone) {
    const response = await fetch('/api/project', {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project)
    });
    if (!response.ok) throw new Error((await response.json()).error || '保存失败');
    return;
  }
  const database = await openDraftDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put(project, location.pathname);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('草稿保存已中断'));
  });
}

export async function exportFile(name, content, type) {
  if (!standalone) {
    const response = await fetch('/api/export', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, content})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '导出失败');
    return {fileName: result.fileName, message: '已保存到工具目录的 exports 文件夹'};
  }
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return {fileName: name, message: '已交给浏览器保存，请查看下载位置'};
}

export async function getMermaid() {
  return globalThis.mermaid;
}

// 上下文桥接：只暴露笔记相关的 ipc 调用，渲染进程不直接接触 fs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesApi', {
  listNotes: () => ipcRenderer.invoke('notes:list'),
  readNote: (id) => ipcRenderer.invoke('notes:read', id),
  writeNote: (payload) => ipcRenderer.invoke('notes:write', payload),
  createNote: (title) => ipcRenderer.invoke('notes:create', title),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  renameNote: (payload) => ipcRenderer.invoke('notes:rename', payload),
  searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
  exportHtml: (payload) => ipcRenderer.invoke('notes:exportHtml', payload)
});

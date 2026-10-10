// Preload script: the only IPC calls the hub page can make.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openApp: (appId) => ipcRenderer.send('open-app', appId),
  startClipForge: () => ipcRenderer.send('start-clipforge'),
  onSwitchTab: (cb) => ipcRenderer.on('switch-tab', (_e, tab) => cb(tab)),
  status: () => ipcRenderer.invoke('hub:status'),
  setup: () => ipcRenderer.invoke('hub:setup'),
  installOllama: () => ipcRenderer.invoke('ollama:install'),
  models: () => ipcRenderer.invoke('models:overview'),
  download: (kind, id) => ipcRenderer.invoke('models:download', kind, id),
  deleteModel: (kind, id) => ipcRenderer.invoke('models:delete', kind, id),
  useModel: (kind, id) => ipcRenderer.invoke('models:use', kind, id),
  onProgress: (cb) => ipcRenderer.on('models:progress', (_e, p) => cb(p)),
  apps: () => ipcRenderer.invoke('apps:list'),
  addApp: (name, address) => ipcRenderer.invoke('apps:add', name, address),
  removeApp: (id) => ipcRenderer.invoke('apps:remove', id),
  showTab: (id) => ipcRenderer.send('tab:show', id),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
});

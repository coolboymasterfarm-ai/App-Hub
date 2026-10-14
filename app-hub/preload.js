// Preload script: the only IPC calls the hub page can make.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('hub', {
  // hub
  info: () => ipcRenderer.invoke('hub:info'),
  set: (patch) => ipcRenderer.invoke('hub:set', patch),
  telegramTest: () => ipcRenderer.invoke('telegram:test'),
  discordTest: () => ipcRenderer.invoke('discord:test'),
  open: (folder) => ipcRenderer.invoke('hub:open', folder),
  cleanPlan: (days) => ipcRenderer.invoke('clean:plan', days),
  cleanRun: (days) => ipcRenderer.invoke('clean:run', days),
  hardware: () => ipcRenderer.invoke('hub:hardware'),
  onShortcut: on('hub:shortcut'),
  onShow: on('hub:show'), // an agent asked to open an app
  onAgentSeen: on('agent:seen'),
  onAgentCall: on('agent:call'),
  // pages: the hub page owns the layout and tells the main process where app pages go
  show: (id) => ipcRenderer.send('page:show', id),
  rect: (r) => ipcRenderer.send('page:rect', r),
  cover: (on) => ipcRenderer.send('page:cover', on),
  // ClipForge
  cfState: () => ipcRenderer.invoke('cf:state'),
  cfStart: () => ipcRenderer.send('cf:start'),
  cfRestart: () => ipcRenderer.send('cf:restart'),
  onCfState: on('cf:state'),
  onCfOpen: on('cf:open'),
  // one-click installs
  installState: () => ipcRenderer.invoke('install:state'),
  install: (id) => ipcRenderer.invoke('install:run', id),
  onInstallLog: on('install:log'),
  // AI models
  models: () => ipcRenderer.invoke('models:overview'),
  download: (kind, id) => ipcRenderer.invoke('models:download', kind, id),
  deleteModel: (kind, id) => ipcRenderer.invoke('models:delete', kind, id),
  useModel: (kind, id) => ipcRenderer.invoke('models:use', kind, id),
  onProgress: on('models:progress'),
  // the user's apps
  apps: () => ipcRenderer.invoke('apps:list'),
  addApp: (name, address) => ipcRenderer.invoke('apps:add', name, address),
  editApp: (id, name, address) => ipcRenderer.invoke('apps:edit', id, name, address),
  removeApp: (id) => ipcRenderer.invoke('apps:remove', id),
  pickFolder: () => ipcRenderer.invoke('apps:pick'),
  pathForFile: (file) => webUtils.getPathForFile(file), // a folder dropped on the Add app box
  onAppsChanged: on('apps:changed'),
  // My Apps: StarNet, FreeLLMAPI, OmniRoute
  mineState: () => ipcRenderer.invoke('mine:state'),
  startMine: (id) => ipcRenderer.invoke('mine:start', id),
  // Writing Assistant: its endpoint + API key, set in Settings
  writingConfig: () => ipcRenderer.invoke('writing:config'),
  writingSet: (patch) => ipcRenderer.invoke('writing:set', patch),
  writingRestart: () => ipcRenderer.invoke('writing:restart'),
  nav: (id, action) => ipcRenderer.send('tab:nav', id, action),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  onTabState: on('tab:state'),
});

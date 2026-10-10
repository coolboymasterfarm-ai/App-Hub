// Preload script for secure IPC
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApps: () => ipcRenderer.invoke('get-apps'),
  openApp: (appId) => ipcRenderer.send('open-app', appId),
  startClipForge: () => ipcRenderer.send('start-clipforge'),
  onSwitchTab: (callback) => {
    ipcRenderer.on('switch-tab', (event, tab) => callback(tab));
  }
});

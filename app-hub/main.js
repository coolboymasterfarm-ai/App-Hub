const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8765;
// In the repo, ClipForge sits next to app-hub. Fallback: the old Software Factory location.
const CF_REPO = path.join(__dirname, '..', 'ClipForge');
const CF_DIR = fs.existsSync(CF_REPO) ? CF_REPO : path.join(__dirname, '..', '..', 'Software Factory', 'ClipForge');
const PY = path.join(CF_DIR, '.venv', 'Scripts', 'python.exe');
let server = null;
let win = null;

function startClipForge() {
  if (server) return;
  if (!fs.existsSync(PY)) { console.error('ClipForge python not found:', PY); return; }
  server = spawn(PY, ['-m', 'clipforge', '--port', String(PORT)], { cwd: CF_DIR, stdio: 'inherit', windowsHide: true });
  server.on('exit', (c) => { console.error('ClipForge server exited', c); server = null; });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, title: 'App Hub',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile('index.html');
}

ipcMain.on('start-clipforge', startClipForge);
ipcMain.on('open-app', (_e, id) => { if (id === 'clipforge') { startClipForge(); win && win.webContents.send('switch-tab', 'clipforge'); } });
ipcMain.handle('get-apps', () => [{ id: 'clipforge', name: 'ClipForge' }]);

app.whenReady().then(() => { startClipForge(); createWindow(); });
app.on('before-quit', () => { if (server) server.kill(); });
app.on('window-all-closed', () => app.quit());

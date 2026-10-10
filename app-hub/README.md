# App Hub (desktop app)

Electron app: the hub window, app tabs, AI Models page, and the Windows installer config.
See the [main README](../README.md) for downloading the .exe and first-run steps.

| File | Job |
|---|---|
| `main.js` | Window, ClipForge/Ollama processes and status, notifications, app tabs (WebContentsView), model downloads, shortcuts, IPC |
| `preload.js` | The only IPC calls the page can make (`window.hub`) |
| `index.html`, `hub.css`, `renderer.js` | Hub UI: title bar, sidebar, Home, ClipForge, AI Models, Settings, Add/Edit app |
| `src/hardware.js` | Detects CPU, RAM, GPUs + VRAM, free disk |
| `src/models.js` | Model catalog + which models fit this PC (tested) |
| `src/apps.js` | App list + address validation (tested) |
| `test/` | `npm test` |
| `start.bat` / `build.bat` | Run from source / build the .exe on Windows |

To add a model to the recommendations, add a line to `WHISPER` or `CHAT` in `src/models.js`.

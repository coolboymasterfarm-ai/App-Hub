# App Hub (desktop app)

Electron app: the hub window, app tabs, AI Models page, and the Windows installer config.
See the [main README](../README.md) for downloading the .exe and first-run steps.

| File | Job |
|---|---|
| `main.js` | Window, ClipForge/Ollama processes, app tabs (WebContentsView), model downloads, IPC |
| `preload.js` | The only IPC calls the page can make |
| `index.html`, `renderer.js` | Hub UI: tabs, Home tiles, Add app, AI Models page |
| `src/hardware.js` | Detects CPU, RAM, GPUs + VRAM, free disk |
| `src/models.js` | Model catalog + which models fit this PC (tested) |
| `src/apps.js` | App list + address validation (tested) |
| `test/` | `npm test` |
| `clipforge.builder.js` | Builds the standalone `ClipForge.exe` from the same code |
| `start.bat` / `build.bat` | Run from source / build both .exe apps on Windows |

To add a model to the recommendations, add a line to `WHISPER` or `CHAT` in `src/models.js`.

# App Hub

A Windows desktop app (a real `.exe`) that keeps your apps in one window, each in its own tab. It ships with
**ClipForge** (the AI auto-clipper) built in, checks your PC's hardware, recommends the AI models that will
run well on it, and downloads them for you.

| Folder | What it is |
|---|---|
| `app-hub/` | The Electron desktop app (the hub window, tabs, AI Models page, installer config) |
| `ClipForge/` | The AI auto-clipper (Python backend + web UI), bundled inside the .exe |
| `.github/workflows/build-exe.yml` | Builds the Windows `.exe` on GitHub for every push |

## Get the .exe

**Easiest – from GitHub:**
1. On GitHub, open the **Actions** tab → **Build App Hub .exe** → the latest green run.
2. Under **Artifacts**, download **App-Hub-windows** and unzip it. You get two files:
   - `App-Hub-Setup-<version>.exe` – installer (Start-menu + desktop shortcut, uninstaller). Recommended.
   - `App-Hub-Portable-<version>.exe` – one file, no install, just double-click.
3. Tagging a commit `v1.2.3` and pushing the tag also publishes both files on the **Releases** page.

**Build it on your own Windows PC:** install Node.js LTS, then double-click `app-hub\build.bat`.
The files land in `app-hub\dist\`.

## First run

1. Open App Hub. The Home tab shows **"ClipForge needs a one-time setup"** → click **Run setup**.
   A console window opens and installs Python, ffmpeg, HyperFrames, Ollama, etc. (5–15 min).
   Press a key in it when it says *Done*.
2. Open the **AI Models** tab. App Hub shows your CPU, RAM, graphics card (with VRAM) and free disk, and
   marks every model **Fast (GPU) / Works (CPU) / Slow / Won't fit**. The best fit is tagged **Recommended**.
3. Click **Download** on the recommended chat model and speech model. Progress shows in the row.
   When a download finishes, the recommended model is switched on in ClipForge automatically;
   **Use in ClipForge** switches to any other installed model, **Delete** frees the disk space.
4. Open the **ClipForge** tab and make clips.

## Features

- **Tabs for your apps:** Home → **Add App** (name + web address, `http://localhost:PORT`, or a local `.html` file).
  Each app opens in its own tab with a close (×). Remove an app with the × on its tile. The list is remembered.
- **ClipForge built in:** started and stopped by the hub; no separate window.
- **Hardware check:** CPU, threads, RAM, every GPU with real VRAM (`nvidia-smi`, or the Windows registry for AMD/Intel), free disk.
- **Model recommendations:** chat models (Ollama: Qwen3, Llama, Gemma) and speech models (Whisper) rated for your PC.
- **Model downloads in the app:** chat models through Ollama with live progress; Whisper models into ClipForge's own model folder.
- **Install Ollama** from the AI Models tab if it's missing (via winget). Ollama is started with the hub.
- **Low-disk and won't-fit warnings** before a download starts.

## Where things live (installed .exe)

- ClipForge, its Python, tools and models: `%LOCALAPPDATA%\App Hub\ClipForge` (kept when you update or reinstall App Hub).
- Your app list: `%APPDATA%\App Hub\apps.json`.
- Clips: `%LOCALAPPDATA%\App Hub\ClipForge\data\projects\<id>\clips\`.

## Developing

```bash
cd app-hub
npm install
npm test        # logic tests (model recommendations, address checks, app list)
npm start       # runs the hub from source, using ../ClipForge
```

On Windows, `start.bat` does the same with a double-click. ClipForge on its own still works with `ClipForge\Install.bat` + `Start.bat`.

## Not in the repo

Large/generated files (`.venv`, `bin/`, `node_modules/`, `data/models|music|projects`, `dist/`) and secrets –
`ClipForge/data/settings.example.json` has a placeholder instead of the real `omniroute_key`.

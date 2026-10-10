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
2. Under **Artifacts**, download **App-Hub-windows** and unzip it. You get four files:
   - `App-Hub-Setup-<version>.exe` – App Hub installer (Start-menu + desktop shortcut, uninstaller). Recommended.
   - `App-Hub-Portable-<version>.exe` – App Hub as one file, no install, just double-click.
   - `ClipForge-Setup-<version>.exe` / `ClipForge-Portable-<version>.exe` – **ClipForge on its own** as a normal
     desktop app: its own window, Start-menu entry and icon, no CMD window and no browser. It shares its install
     and AI models with App Hub, so you only set it up once.
3. Tagging a commit `v1.2.3` and pushing the tag also publishes both files on the **Releases** page.

**Build it on your own Windows PC:** install Node.js LTS, then double-click `app-hub\build.bat`.
The files land in `app-hub\dist\`.

## First run

1. Open App Hub. The Home tab shows **Install apps** with everything not on this PC yet (Ollama, ClipForge).
   Click **Install all** to install them one by one, or **Install** on just one. It all runs inside App Hub,
   with no CMD window: the latest step shows under each app, and **Show details** has the full log.
   ClipForge takes 5–15 min (Python, ffmpeg, HyperFrames…). The section disappears when everything is installed.
2. Open the **AI Models** tab. App Hub shows your CPU, RAM, graphics card (with VRAM) and free disk, and
   marks every model **Fast (GPU) / Works (CPU) / Slow / Won't fit**. The best fit is tagged **Recommended**.
3. Click **Download** on the recommended chat model and speech model. Progress shows in the row.
   When a download finishes, the recommended model is switched on in ClipForge automatically;
   **Use in ClipForge** switches to any other installed model, **Delete** frees the disk space.
4. Open the **ClipForge** tab and make clips.

## Features

- **Tabs for your apps:** Home → **Add App**. Give it a name and either a web address, `http://localhost:PORT`,
  or **your own app folder**: click **Choose folder…** or drag the folder onto the box. The folder needs an
  `index.html`; App Hub copies it into its own apps folder, so it keeps working even if you move the original.
  Each app opens in its own tab with a close (×). Remove an app with the × on its tile (this deletes the hub's copy,
  never your original). The list is remembered.
- **One-click installs:** apps that aren't on the PC yet get an **Install** button on Home, plus **Install all**.
- **ClipForge built in:** installed, started and stopped by the hub. No CMD windows.
- **Hardware check:** CPU, threads, RAM, every GPU with real VRAM (`nvidia-smi`, or the Windows registry for AMD/Intel), free disk.
- **Model recommendations:** chat models (Ollama: Qwen3, Llama, Gemma) and speech models (Whisper) rated for your PC.
- **Model downloads in the app:** chat models through Ollama with live progress; Whisper models into ClipForge's own model folder.
- **Install Ollama** from Home or the AI Models tab if it's missing (via winget, hidden). Ollama is started with the hub.
- **Low-disk and won't-fit warnings** before a download starts.

## Where things live (installed .exe)

- ClipForge, its Python, tools and models: `%LOCALAPPDATA%\App Hub\ClipForge` (kept when you update or reinstall App Hub).
- Your app list: `%APPDATA%\App Hub\apps.json`. Folder apps: `%APPDATA%\App Hub\apps\`.
- Clips: `%LOCALAPPDATA%\App Hub\ClipForge\data\projects\<id>\clips\`.

## Developing

```bash
cd app-hub
npm install
npm test        # logic tests (model recommendations, address checks, app list)
npm start       # runs the hub from source, using ../ClipForge
```

`npm run start:clipforge` runs the standalone ClipForge window. On Windows, `start.bat` runs App Hub with a double-click.
The old `ClipForge\Install.bat` + `Start.bat` (CMD window + browser) still work, but `ClipForge.exe` replaces them.

## Not in the repo

Large/generated files (`.venv`, `bin/`, `node_modules/`, `data/models|music|projects`, `dist/`) and secrets –
`ClipForge/data/settings.example.json` has a placeholder instead of the real `omniroute_key`.

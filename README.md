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

**Update the App Hub you already have:** double-click `Update.bat` in this folder. It pulls the latest code,
builds a new installer and installs it over your App Hub (needs Git and Node.js LTS). Your apps, videos, models and
settings are kept.

**Build it on your own Windows PC:** install Node.js LTS, then double-click `app-hub\build.bat`.
The files land in `app-hub\dist\`.

## First run

1. Open App Hub. **Home** shows a **Finish setting up** card with everything not on this PC yet (Ollama, ClipForge).
   Click **Install all** to install them one by one, or **Install** on just one. It all runs inside App Hub,
   with no CMD window: the latest step shows under each app, and **Show details** has the full log.
   ClipForge takes 5–15 min (Python, ffmpeg, HyperFrames…). The card disappears when everything is installed.
2. Open **AI Models**. App Hub shows your CPU, RAM, graphics card (with VRAM) and free disk, and rates every
   model **Fast on GPU / Works on CPU / Slow here / Won't fit**. Click **Set up recommended**: it downloads
   the best chat and speech models for this PC and switches ClipForge to them.
3. Open **ClipForge** in the sidebar and make clips. You get a Windows notification when a video is done.

## Features

**The hub**
- **Modern desktop window:** custom title bar with the normal Windows buttons, a sidebar for everything
  (Home, ClipForge, AI Models, your apps, Settings), and the window's size and position remembered.
- **Home dashboard:** greeting, ClipForge / AI / PC status cards, your recent ClipForge videos (click one to open it),
  and your apps as tiles.
- **Your apps:** **Add app** (sidebar **+** or Home) takes a web address, `http://localhost:PORT`, or **your own app
  folder** (Choose folder… or drag it in; it needs an `index.html`, and App Hub keeps its own copy). Each app opens in
  its own tab with **back / forward / reload / open in browser** in the title bar, its own icon (the site's favicon),
  and a friendly error page with **Try again** if it can't load. Edit or remove apps from their tile.
- **One-click installs:** apps that aren't on the PC yet get **Install** buttons on Home, plus **Install all**.
- **Settings:** start App Hub with Windows, notifications on/off, restart ClipForge, open the clips / music / log /
  data folders, and the keyboard shortcuts.
- **Keyboard shortcuts:** `Ctrl+1…9` pages, `Ctrl+Tab` next page, `Ctrl+R` reload, `Ctrl+W` close app tab,
  `Alt+←/→` back/forward, `Ctrl+,` settings. They work wherever the focus is, even inside an app.

**ClipForge** (see `ClipForge/README.md`)
- Built in: installed, started, watched and restarted by the hub. No CMD windows. If it stops, the ClipForge page says
  so and offers **Restart**.
- **Notifications** when a video finishes (or fails); clicking one opens that video.
- New: make your own clips from the **transcript**, a full-size **clip player**, sort, search, delete clips.

**AI models**
- **Hardware check:** CPU, threads, RAM, every GPU with real VRAM (`nvidia-smi`, or the Windows registry for AMD/Intel), free disk.
- **Model recommendations:** chat models (Ollama: Qwen3, Llama, Gemma) and speech models (Whisper) rated for your PC,
  with one-click **Set up recommended**.
- **Model downloads in the app:** chat models through Ollama with live progress; Whisper models into ClipForge's own model folder.
- **Install Ollama** from Home or the AI Models tab if it's missing (via winget, hidden). Ollama is started with the hub.
- **Low-disk and won't-fit warnings** before a download starts.

## Let your agents use App Hub (Starnet, Claude Code)

Your [Starnet](https://github.com/androoAGI/starnet) crew can use App Hub's apps as tools. They can clip a video
(or a channel's newest upload) in one call, wait for it, copy the best clips into their own folder, change
HyperFrames styles, and download models. That works from a chat, a schedule, Telegram or a work line. Only
programs on your PC can connect, and they need your key.

**Set up and examples: [starnet/README.md](starnet/README.md).** In short:
1. In App Hub, go to **Settings → Starnet & agents** and copy the connector address
   (`http://127.0.0.1:8770/mcp`) and the key.
2. In Starnet, go to **CONNECT → ABILITIES → CONNECTED SERVICES → ADD A CONNECTOR**. Use id `apphub`, type
   **HTTP**, paste both, set timeout ms to `600000`, then click **+ ADD & CONNECT**.
3. Import the skill (`starnet/app-hub-clipforge.starnet-skill.json`) and the three recipes (`starnet/recipes/`).

**Reset key** makes a new key and copies it for you; paste it into Starnet's connector (**✎ EDIT**). For Claude
Code, click **Copy config** and paste it into `.mcp.json`; it keeps working after a key reset. Scripts can use
the same API: `http://127.0.0.1:8770/v1/...` with `Authorization: Bearer <key>`, starting with `GET /v1/status`.

## Where things live (installed .exe)

- ClipForge, its Python, tools and models: `%LOCALAPPDATA%\App Hub\ClipForge` (kept when you update or reinstall App Hub).
- Your app list: `%APPDATA%\App Hub\apps.json`. Folder apps: `%APPDATA%\App Hub\apps\`.
- Hub settings and window position: `%APPDATA%\App Hub\hub-settings.json`, `window.json`. ClipForge's log: `clipforge.log` there too.
- Clips: `%LOCALAPPDATA%\App Hub\ClipForge\data\projects\<id>\clips\`.
- Notes for Starnet (when switched on): `Documents\App Hub\Starnet inbox\`. Clips sent to Starnet: `<Starnet's workspaces>\<agent>\clipforge\<id>\`.

## Developing

```bash
cd app-hub
npm install
npm test        # logic tests (model recommendations, address checks, app list)
npm start       # runs the hub from source, using ../ClipForge

cd ../ClipForge
pip install -r requirements.txt pytest httpx
python -m pytest tests   # ClipForge: editing, clip picking, the API and its local-only guard
```

GitHub runs both test suites and builds the .exe on every push.

On Windows, `start.bat` does the same with a double-click. ClipForge on its own still works with `ClipForge\Install.bat` + `Start.bat`.

## Not in the repo

Large/generated files (`.venv`, `bin/`, `node_modules/`, `data/models|music|projects`, `dist/`) and secrets –
`ClipForge/data/settings.example.json` has a placeholder instead of the real `omniroute_key`.

# App‑Hub Repository

This private repository contains two top‑level folders:

- **app‑hub** – the Electron‑based UI that loads the ClipForge tab.
- **ClipForge** – the complete, runnable AI auto‑clipper (Python backend).

## Setup on a new PC

1. **Clone the repo**:
   ```bash
   git clone https://github.com/<your‑username>/App-Hub.git
   cd App-Hub
   ```
2. **Install ClipForge** (one time, needs internet): double-click `ClipForge\Install.bat` and wait for all 7 steps.
3. **Run App Hub**: open a terminal in `app-hub`, run `npm install`, then `start.bat`.
   Click the ClipForge tile or tab. App Hub starts the ClipForge server for you (no separate server step).

## What is NOT included

- Any duplicate copies of ClipForge (e.g., `ClipForge‑original`, `clipforge‑next`).
- Large generated assets (binary `bin/` folder, `data/models/`, `data/music/`, `data/projects/`).
- Project‑specific notes, tickets, research docs, price‑calculator files, or any other Software‑Factory artefacts.
- Secrets – the real `omniroute_key` has been redacted; a placeholder `settings.example.json` is provided.

## .gitignore

The repository ships with a `.gitignore` that excludes virtual environments, node modules, build output, Python caches, log files, large data folders, and any file over 50 MB.

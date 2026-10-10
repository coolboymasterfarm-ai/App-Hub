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
2. **Install ClipForge**:
   ```bash
   cd ClipForge
   python -m venv .venv   # create a virtual env
   .\.venv\Scripts\activate   # Windows activation
   pip install -r requirements.txt
   ```
   Then run the server:
   ```bash
   python server.py   # serves on http://localhost:8765
   ```
3. **Install App‑Hub**:
   ```bash
   cd ..\app‑hub
   npm install   # installs Electron and deps
   start.bat      # launches the Electron app
   ```
   The **ClipForge** tab will appear automatically and connect to the local server.

## What is NOT included

- Any duplicate copies of ClipForge (e.g., `ClipForge‑original`, `clipforge‑next`).
- Large generated assets (binary `bin/` folder, `data/models/`, `data/music/`, `data/projects/`).
- Project‑specific notes, tickets, research docs, price‑calculator files, or any other Software‑Factory artefacts.
- Secrets – the real `omniroute_key` has been redacted; a placeholder `settings.example.json` is provided.

## .gitignore

The repository ships with a `.gitignore` that excludes virtual environments, node modules, build output, Python caches, log files, large data folders, and any file over 50 MB.

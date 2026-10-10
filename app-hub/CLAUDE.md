# App Hub - project rules (CLAUDE.md)

Every agent working on this project reads this file first, together with /factory-rules.md
and /commander-profile.md in the vault (C:\Users\bryce\Downloads\starnet\Software Factory).

## What App Hub is
A Windows desktop app where the user keeps the apps they use in one place. Each app opens in its own tab
inside the hub, and the user clicks between tabs instead of jumping between separate windows and tools.

## Version 1 - the ONLY things to build
1. A Home tab: shows the user's apps as simple tiles, plus an "Add app" tile.
2. Add app: a small form - Name + Address (a web address like https://... or a local one like http://localhost:3000,
   or a local .html file). Validate it; show a clear message if it's wrong.
3. Open app: clicking a tile opens that app in its own tab. Tabs sit in one bar at the top; clicking a tab switches to it;
   each tab has a close (x). The Home tab can't be closed.
4. Remove app: from the Home tile (with a confirm).
5. Remembered: the app list is saved and comes back after closing and reopening App Hub.

## Version 1.1 - added at Bryce's request
6. Windows .exe: NSIS installer + portable exe via electron-builder (`build.bat`, or the GitHub Actions workflow).
   ClipForge ships inside and is copied to %LOCALAPPDATA%\App Hub\ClipForge on first run; setup runs its Install.bat.
7. AI Models tab: detects the PC's hardware, recommends models for the hub's apps (src/models.js), downloads them
   (Ollama for chat models, faster-whisper for speech), switches ClipForge to them, deletes them.

## NOT built yet (do not build, even if it seems small)
API key manager, accounts/sign-in, app store/catalog, themes, sync, auto-update, code signing, running native .exe programs
inside a tab, drag-to-reorder, notifications. Write any good idea for later in /ideas/app-hub-later.md instead.

## Tech (decided - change only with Bryce's OK)
- Electron (latest stable) + plain HTML, CSS and JavaScript. No UI framework.
- Each app tab is an Electron WebContentsView (BrowserView is deprecated). The hub UI is the main window's page.
- Security: contextIsolation on, nodeIntegration off, sandbox on for app tabs; one small preload script with only the
  IPC calls the hub needs. Apps in tabs never get Node access.
- Data: one JSON file in Electron's userData folder (app.getPath('userData')). Write safely (temp file, then rename).
- Tests: pure logic (app list load/save/add/remove, address validation, model recommendations) gets `node --test` tests. UI gets click checks.
- Run on Bryce's PC: double-click start.bat in the project folder (first run installs Electron, then starts App Hub).
- Location: C:\Users\bryce\Downloads\starnet\Projects\app-hub. Git: main + one feature branch per ticket. Never merge to main.

## How to work (Bryce's rules - non-negotiable)
- Keep it very simple. Smallest working version of each feature. No extra features.
- Small steps: one feature per ticket, finish and verify it before starting the next.
- After EVERY feature, write "How to check it on your PC": exactly what to double-click, what to click,
  and what Bryce should see. Numbered steps, plain words.
- Never say "done" without listing (1) the tests you actually ran and their real output, and
  (2) what Bryce should click to verify it himself.
- If something fails: show the actual error (exact text/output) first, before trying any fix.
- If the same fix fails twice, stop and ask Bryce.
- Not buggy: no console errors, no crashes on empty/odd input, the app list survives a restart.

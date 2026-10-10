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
3. Open app: clicking a tile opens that app in its own tab. Open apps are listed in the sidebar; clicking one switches
   to it; each has a close (x). Home can't be closed.
4. Remove app: from the Home tile (with a confirm).
5. Remembered: the app list is saved and comes back after closing and reopening App Hub.

## Version 1.1 - added at Bryce's request
6. Windows .exe: NSIS installer + portable exe via electron-builder (`build.bat`, or the GitHub Actions workflow).
   ClipForge ships inside and is copied to %LOCALAPPDATA%\App Hub\ClipForge on first run; setup runs its Install.bat.
7. AI Models tab: detects the PC's hardware, recommends models for the hub's apps (src/models.js), downloads them
   (Ollama for chat models, faster-whisper for speech), switches ClipForge to them, deletes them.
8. Folder apps: Add app accepts a folder with an index.html (Choose folder… or drag and drop); it is copied to
   userData/apps/ and the copy is deleted when the app is removed.
9. One-click installs: Home lists apps missing from the PC (INSTALLERS in main.js: Ollama, ClipForge) with Install and
   Install all. Installers run hidden (no CMD window) and stream their output into the hub.

## Version 1.2 - the redesign (Bryce asked for "everything to the max")
11. Shell: hidden title bar + Windows' own buttons (titleBarOverlay), sidebar navigation instead of top tabs,
    window bounds remembered. The hub page owns the layout and sends main.js the rect where app views go.
12. App tabs: back/forward/reload/open-in-browser in the title bar, favicons, a friendly error page, edit app.
    Use webContents.canGoBack() etc. - navigationHistory.canGoBack() hangs Electron 31 while a page loads.
13. Home dashboard (status cards, recent ClipForge videos), Settings page (start with Windows, notifications,
    restart ClipForge, open folders), keyboard shortcuts via before-input-event, ClipForge finish notifications.
14. ClipForge: redesigned UI, transcript -> make your own clip, clip player, sort/search/delete, local-only API guard.

## Version 1.3 - agents (Bryce asked: Starnet agents should use App Hub's apps)
15. App Hub API (src/agentapi.js): http://127.0.0.1:8770, one key (Settings > Agent access: show, copy, new key) plus a
    switch per app (ClipForge, AI Models, Your apps). Refuses requests without the key, with an Origin (browsers) or
    a foreign Host. ClipForge's API is passed through under /v1/clipforge/.
16. MCP connector (mcp.js, copied to userData on start): agents on this PC get App Hub's apps as tools. Settings has
    "Copy config" for Starnet's .mcp.json; it runs with App Hub's own Node (ELECTRON_RUN_AS_NODE), no install needed.

## NOT built yet (do not build, even if it seems small)
Accounts/sign-in, app store/catalog, light theme, sync, auto-update, code signing, running native
.exe programs inside a tab, drag-to-reorder. Write any good idea for later in /ideas/app-hub-later.md instead.

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

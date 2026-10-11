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
16. MCP connector (mcp.js, copied to userData on start): Claude Code gets App Hub's apps as tools. Settings has
    "Copy config" for .mcp.json; it runs with App Hub's own Node (ELECTRON_RUN_AS_NODE) and reads the current key.

## Version 1.4 - Starnet (Bryce asked: make it work with github.com/androoAGI/starnet for automation and scheduling)
17. POST /mcp on the App Hub API (MCP over HTTP, stateless JSON). Starnet's installed app refuses stdio connectors on
    the host, so it connects here (CONNECTED SERVICES, HTTP, bearer token = the key). Tools live in mcp-tools.js,
    shared with mcp.js. Tool failures are isError results (HTTP 200), never protocol errors.
18. One-call workflows (Starnet allows ONE connector call per unattended run): clipforge_make_clips can take a
    channel's newest upload, skip a video it already did, wait up to 9.5 min, and copy the best clips into a Starnet
    agent's folder (src/starnet.js; Starnet only sends files from there, max 20 MB). clipforge_wait_for_video resumes.
19. Settings "Starnet & agents": connector address, key (Show/Copy/Reset key), setup steps, last connection, per-app
    switches, and "Tell Starnet when videos finish" (a JSON note in Documents\App Hub\Starnet inbox for a Starnet
    folder trigger). Repo folder starnet/: setup guide, skill package (make-skill-package.js), recipes.

## Version 1.5 - Starnet, better (Bryce asked: keep improving it with Starnet; do NOT install Starnet from App Hub)
20. Clip answers carry what agents post with: caption (hashtags), why, said, cover; `best` limits the answer too.
21. Several videos (one per line, up to 10) in one call, sharing one deadline. Clips over 20 MB get an ffmpeg copy
    that fits Telegram when sent to Starnet; covers are copied too.
22. app_hub_status: ready_to_clip + ClipForge's doctor warnings + videos in progress. "Open Starnet" in Settings
    (only when its shortcut exists). Recipe: Clips + posts for my socials.

23. Less RAM with many apps (1.5.1): app tabs not looked at for 10 min, or the oldest beyond 5 awake, go to sleep
    (closed, src/sleep.js) and reopen at the same address when clicked. Tabs playing sound stay awake.

## Version 1.6 - My Apps (Bryce asked: StarNet, FreeLLMAPI and OmniRoute inside App Hub, like apps)
24. Sidebar and Home have two groups: "My Apps" (ClipForge, StarNet, FreeLLMAPI, OmniRoute) and "Other Apps"
    (the apps the user adds: other companies' sites, GitHub repos, folders). src/myapps.js says where each of
    Bryce's apps is and what address its page is on. Clicking one starts its own program (hidden where it can,
    never installed or changed by App Hub) and opens that page in a normal app tab. They keep running after App
    Hub closes, because other tools use them. StarNet picks a new port each start (read from its startup.log).
    OmniRoute runs as `node <its package.json bin> --no-open` with this PC's Node, hidden: never omniroute.cmd, so no
    CMD window. Survives updates: everything is looked up fresh on each click (bin from package.json, ports from the
    apps' own files, and the Start menu shortcut if an update moved the program).

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

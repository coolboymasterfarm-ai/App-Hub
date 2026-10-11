# App Hub + Starnet

[Starnet](https://github.com/androoAGI/starnet) is where your AI crew lives: agents, chats, schedules,
Telegram and work lines. App Hub is where your apps live: ClipForge and your AI models. Connect the two and
your Starnet agents can use App Hub's apps as tools: make clips from a video, wait for them, and hand the
best ones over. They can run on a schedule, from a Telegram message, or as one step in a work line.

```
 Starnet (the crew, the schedule)            App Hub (the apps)
 ┌──────────────────────────────┐   tools   ┌──────────────────────────────┐
 │ chat · routines · Telegram   │ ────────▶ │ ClipForge: clips, captions,  │
 │ recipes · work lines         │  :8770    │ HyperFrames · AI models      │
 │                              │ ◀──────── │                              │
 └──────────────────────────────┘  clips +  └──────────────────────────────┘
        ▲     a note when a video finishes (folder)      │
        └────────────────────────────────────────────────┘
```

Both run on your PC. Nothing goes through the internet between them, and App Hub only lets in programs on
this PC that have its key.

## Set it up (one time, about 5 minutes)

**1. Get App Hub 1.4 or newer.** Double-click `Update.bat`. In App Hub, open **Settings** and find the
**Starnet & agents** card.

**2. Add App Hub to Starnet.**
1. In Starnet, go to **CONNECT → ABILITIES → CONNECTED SERVICES → ADD A CONNECTOR**.
2. Fill in:
   | Field | Value |
   | --- | --- |
   | id | `apphub` |
   | label | `App Hub` |
   | type | **HTTP** |
   | URL | `http://127.0.0.1:8770/mcp` (App Hub's **Copy** button next to "Connector address") |
   | bearer token | your key (App Hub's **Copy** button next to "Key") |
   | advanced → timeout ms | `600000` |
3. Click **+ ADD & CONNECT**. Starnet should say **connected — 18 tool(s)**. In App Hub, the card now says
   **● Connected: Starnet**.

The timeout matters: it lets one call wait up to 10 minutes while ClipForge finishes a video. The default is
2 minutes.

**3. Teach your agents how (the skill).** In Starnet, go to **CONNECT → ABILITIES → SKILL EXCHANGE →
IMPORT EXPORTED PACKAGE** and pick `starnet/app-hub-clipforge.starnet-skill.json` from this repo. Then click
**INSTALL SKILL**. The skill installs for the agent selected in that window; repeat for each agent you want
to use App Hub.

**4. Add the ready-made jobs (recipes).** In Starnet, go to **MY WORK → RECIPES → ⇪ IMPORT** and pick each
file in `starnet/recipes/`:
- **Clip a video with ClipForge**: paste a link or a file path and get the best clips.
- **Clip my newest upload**: give it your channel. Its suggested schedule is every morning.

**5. (Optional) Run Starnet's agents for free on your own PC.** In App Hub, go to **AI Models** and download
`qwen3:8b`. Then in Starnet, pick **OLLAMA** as the provider. Both apps use the same Ollama, so a model
you download in App Hub shows up in Starnet.

## Use it

**Chat.** Tell an agent: *"Clip this video with App Hub: https://youtube.com/watch?v=… and send me the best 3."*
The first time, Starnet asks you to allow the App Hub connector. Choose **Always** if you trust it.

**Schedules.** Go to **AUTOMATE → SCHEDULES → CREATE ROUTINE**.
- **Name**: Morning clips
- **Agent**: the agent with the skill
- **What should it do?**:
  > Use the App Hub connector. Make exactly ONE call to mcp__apphub__clipforge_make_clips with input
  > "https://www.youtube.com/@yourchannel", newest true, wait_minutes 9, skip_if_done true,
  > send_to_starnet "agent", best 3. Then list the clips best first: hook title, length, score and path.
- **When**: `0 9 * * *` (every day at 9:00)
- Tick **Let this routine use your connected tools**. Without it, the routine can't see App Hub.
- **Result destination**: your Telegram chat, if you connected one.

You can also open the **Clip my newest upload** recipe and choose **MAKE ROUTINE**. Tick the same box.

**Telegram.** Connect Telegram under **CONNECT → CHANNELS**. Then message your station:
*"Clip https://youtu.be/… with App Hub"*. The agent replies with the clips' titles and where they are.

**When a video finishes, start a work line.** In App Hub **Settings**, switch on **Tell Starnet when videos
finish**. App Hub then drops a small note (`clipforge-<id>.json`) in `Documents\App Hub\Starnet inbox` every
time ClipForge finishes a video, including ones you started yourself. In Starnet, go to **AUTOMATE →
WORKFLOWS**, open a line and add a folder trigger ("when a file lands in a folder") for that folder. Give it
a task such as *"Write a TikTok caption and 5 hashtags for each clip in this note."* The note has every
clip's hook title, length, score and file path.

## Reset the key

In App Hub, go to **Settings → Starnet & agents → Reset key**. The old key stops working at once, and the new
one is copied for you. Then in Starnet: **CONNECTED SERVICES → App Hub → ✎ EDIT**, paste the new key into
**bearer token**, and click **SAVE & RECONNECT**. Claude Code needs no change: its connector reads the
current key from App Hub.

To stop agents using one app without changing the key, switch it off in the same card (ClipForge, AI Models,
Your apps). Agents then get "switched off" instead.

## What the tools are

| Tool | What it does |
| --- | --- |
| `clipforge_make_clips` | The main one. A link, a channel's newest upload (`newest`) or a file → clips. It can wait (`wait_minutes`), skip videos it already did (`skip_if_done`) and copy the best clips into an agent's folder (`send_to_starnet`, `best`). |
| `clipforge_wait_for_video` | Wait for or check a video by id, and optionally send its clips to Starnet. |
| `clipforge_list_videos`, `clipforge_get_video`, `clipforge_transcript` | See videos, their clips and the transcript. |
| `clipforge_make_clip`, `clipforge_edit_clip`, `clipforge_title_ideas`, `clipforge_rerender_all` | Cut your own clip, change a title, timing or captions, get title ideas, and re-render. |
| `clipforge_styles`, `clipforge_get_settings`, `clipforge_set_settings` | HyperFrames caption styles, transitions, motion graphics, clip count and length. |
| `clipforge_job` | Progress of one job. |
| `models_overview`, `models_download`, `models_use` | This PC's hardware and AI models: download one, and switch ClipForge to it. |
| `app_hub_status`, `apps_list` | What App Hub has running, and your own apps. |

In Starnet, every tool name starts with `mcp__apphub__`.

## Good to know (Starnet's safety rules)

- **One App Hub call per scheduled run.** After a schedule (or Telegram) run gets its first answer from a
  connector, Starnet blocks further connector calls in that run. That's why `clipforge_make_clips` can do
  the whole job in one call. In a chat you're watching, Starnet asks you before each extra call instead.
- **Long videos.** One call waits up to 9½ minutes. If a video takes longer, the answer says "still
  working" with its id. The next run picks it up with `skip_if_done` or `clipforge_wait_for_video`.
- **Getting video files on Telegram.** Starnet sends files only from an agent's own folder, and only up
  to 20 MB. `send_to_starnet` copies the clips there and flags any over 20 MB. In a scheduled run, Starnet
  also blocks *sending* a file after an outside answer, unless that agent is set to **FULL ACCESS**.
  Otherwise you get the titles and paths, and the clips wait in the folder.
- **Keep App Hub open** while agents use it. **Starnet must be open** for its schedules to run.
- Night Shift (away work) picks its own tasks, so use a **schedule** to clip videos while you're away.

## If something doesn't work

| You see | Do this |
| --- | --- |
| Starnet: "saved, but not connected" | Is App Hub open? Check the URL ends in `/mcp` and the key was pasted whole (starts with `ahk_`). |
| "Missing or wrong API key" | The key was reset. Paste the new one into Starnet (see **Reset the key**). |
| "App Hub only accepts requests from programs on this PC" | Use `127.0.0.1`, not your PC's network name or IP address. |
| "ClipForge is stopped / starting" | Open App Hub's ClipForge page. If it's not installed, click Install on App Hub's Home page. |
| "Agent access to clipforge is switched off" | Turn the switch back on in App Hub Settings. |
| A routine says it has no App Hub tools | Tick **Let this routine use your connected tools** on that routine. |
| "connector request failed: timed out" | Set the connector's timeout ms to `600000` (**✎ EDIT** → advanced). |
| "No Starnet agent folder …" | Use the agent id the message lists. The station's first agent is `agent`. |
| "Starnet was not found on this PC" | Open Starnet once, so its folder exists. |

## The files here

| File | What it is |
| --- | --- |
| `app-hub-clipforge.starnet-skill.json` | The skill, ready to import into Starnet (built from `skills/`). |
| `skills/app-hub-clipforge/SKILL.md` | The same skill, readable. After editing it, run `node starnet/make-skill-package.js`. |
| `recipes/*.starnet-recipe.json` | Ready-made jobs to import into Starnet. |

Claude Code works too: in App Hub **Settings**, click **Copy config** next to "Claude Code" and paste it into
`.mcp.json` in your project folder.

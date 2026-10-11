// App Hub's tools for AI agents, shared by both connectors:
//   - POST /mcp and /mcp/<app> on the App Hub API (src/agentapi.js) - what Starnet connects to (MCP over HTTP)
//   - mcp.js over stdio - what Claude Code / Claude Desktop launch
// api(method, path, body) calls the App Hub API and throws an Error with a plain reason on failure.
// Each app is also its own connector (forApp): only its tools, without the app's name in front
// (ClipForge's make_clips instead of clipforge_make_clips), so one key and one connector per app.

// The apps agents can use: the tool-name prefix each one's tools carry in the all-apps connector.
const APPS = {
  clipforge: { title: 'ClipForge', prefix: 'clipforge_' },
  models: { title: 'AI Models', prefix: 'models_' },
  apps: { title: 'Other Apps', prefix: 'apps_' },
  myapps: { title: 'My Apps', prefix: 'myapps_' },
};

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const READ = { readOnlyHint: true };

// Starnet lets an unattended run make ONE connector call, so the main tool can do the whole job in one go.
const WAIT = num('Minutes to wait for the clips to be finished (0-9.5). Use 9 in Starnet so one call does the whole job; ' +
  'set the connector timeout to 600000. If it is not finished in time you get the id - call the wait_for_video tool later.');
const SEND = str('Optional: a Starnet agent id (e.g. "agent"). The finished clips and covers are copied into that agent\'s ' +
  'Starnet folder (clipforge/<video id>/) so it can open or send them; clips over 20 MB get a smaller copy that fits Telegram.');
const BEST = num('Only the best N clips (default all): in the answer, and in what send_to_starnet copies');

function tools(api) {
  const enc = encodeURIComponent;
  return [
    ['app_hub_status', 'Can clips be made right now (ready_to_clip, and what to fix if not), which apps agents may use, ' +
      'videos in progress, version, Starnet folder.', obj({}), READ,
      () => api('GET', '/v1/status')],
    ['clipforge_make_clips', 'Make short vertical clips (captions, hook title, HyperFrames graphics) from a YouTube link or a ' +
      'video file on this PC. It can wait until they are done and copy the best ones to a Starnet agent, all in one call. ' +
      'Returns the video id, status, and the finished clips best first, each with a ready-to-post caption (with hashtags), ' +
      'why it was picked, what is said, and its video and cover files. Several lines of input make several videos in one call.',
      obj({ input: str('YouTube link, YouTube channel link (with newest=true), or full path of a video file on this PC. ' +
        'One per line for several videos (up to 10)'),
        newest: bool('input is a channel: clip its newest upload'),
        skip_if_done: bool('If this video was clipped before, return those clips instead of making new ones (good for schedules)'),
        topic: str('Optional: what the clips should be about'),
        from_min: num('Optional: only look from this minute'), to_min: num('Optional: only look up to this minute'),
        wait_minutes: WAIT, send_to_starnet: SEND, best: BEST }, ['input']), {},
      (a) => api('POST', '/v1/clipforge/run', a)],
    ['clipforge_wait_for_video', 'Wait for a video to finish (or just check it with wait_minutes 0), then return its clips. ' +
      'Can copy the best clips to a Starnet agent.',
      obj({ id: str('Video id'), wait_minutes: WAIT, send_to_starnet: SEND, best: BEST }, ['id']), {},
      ({ id, ...a }) => api('POST', `/v1/clipforge/wait/${enc(id)}`, a)],
    ['clipforge_list_videos', 'List the videos in ClipForge, newest first, with their status and clip count.', obj({}), READ,
      () => api('GET', '/v1/clipforge/projects')],
    ['clipforge_get_video', 'One video: status, error, every clip (title, score, start/end, caption, file) and the ' +
      'folder on this PC where its files are.', obj({ id: str('Video id') }, ['id']), READ,
      (a) => api('GET', `/v1/clipforge/projects/${enc(a.id)}`)],
    ['clipforge_transcript', 'The word-by-word transcript of a video, with times in seconds.', obj({ id: str('Video id') }, ['id']), READ,
      (a) => api('GET', `/v1/clipforge/projects/${enc(a.id)}/transcript`)],
    ['clipforge_make_clip', 'Make a clip from a chosen part of a video (seconds). Same edit and HyperFrames graphics as the AI picks.',
      obj({ id: str('Video id'), start: num('Start, seconds'), end: num('End, seconds'), title: str('Optional hook title') }, ['id', 'start', 'end']), {},
      (a) => api('POST', `/v1/clipforge/projects/${enc(a.id)}/clips`, { start: a.start, end: a.end, title: a.title })],
    ['clipforge_edit_clip', 'Change a clip and re-render it: hook title, start/end (seconds), or corrected caption words.',
      obj({ id: str('Video id'), n: num('Clip number'), title: str('New hook title'), start: num('New start'), end: num('New end'),
        caption_text: str('The corrected caption words for the clip') }, ['id', 'n']), {},
      ({ id, n, ...patch }) => api('POST', `/v1/clipforge/projects/${enc(id)}/clips/${n}`, patch)],
    ['clipforge_title_ideas', 'Suggest other hook titles for a clip.', obj({ id: str('Video id'), n: num('Clip number') }, ['id', 'n']), READ,
      (a) => api('POST', `/v1/clipforge/projects/${enc(a.id)}/clips/${a.n}/titles`)],
    ['clipforge_rerender_all', 'Re-render every clip of a video with the current settings.', obj({ id: str('Video id') }, ['id']), {},
      (a) => api('POST', `/v1/clipforge/projects/${enc(a.id)}/rerender_all`)],
    ['clipforge_styles', 'The HyperFrames choices: caption styles and shader transitions (values for the set_settings tool).', obj({}), READ,
      () => api('GET', '/v1/clipforge/options')],
    ['clipforge_get_settings', 'ClipForge settings: clip count/length, caption style and position, hook style, transitions, ' +
      'motion graphics, music, AI model...', obj({}), READ, () => api('GET', '/v1/clipforge/settings')],
    ['clipforge_set_settings', 'Change ClipForge settings (only the keys you pass). Applies to the next clips made or re-rendered.',
      obj({ settings: { type: 'object', description: 'e.g. {"caption_style":"neon","clip_count":8,"transitions":"bold"}' } }, ['settings']), {},
      (a) => api('POST', '/v1/clipforge/settings', a.settings)],
    ['clipforge_job', 'Progress of a ClipForge job (from the job id another tool returned).', obj({ job: str('Job id') }, ['job']), READ,
      (a) => api('GET', `/v1/clipforge/jobs/${enc(a.job)}`)],
    ['models_overview', "This PC's hardware and every AI model with whether it fits, is installed, is in use.", obj({}), READ,
      () => api('GET', '/v1/models')],
    ['models_download', 'Download an AI model. kind is "ollama" (chat) or "whisper" (speech).',
      obj({ kind: str('ollama or whisper'), id: str('Model id, e.g. qwen3:8b or small') }, ['kind', 'id']), {},
      (a) => api('POST', '/v1/models/download', a)],
    ['models_use', 'Switch ClipForge to an installed model.', obj({ kind: str('ollama or whisper'), id: str('Model id') }, ['kind', 'id']), {},
      (a) => api('POST', '/v1/models/use', a)],
    ['apps_list', "The user's own apps in App Hub (name and address).", obj({}), READ, () => api('GET', '/v1/apps')],
    ['myapps_running', 'Is StarNet, FreeLLMAPI or OmniRoute running on this PC, on which port, and its address ' +
      '(FreeLLMAPI and OmniRoute also give their OpenAI-style API address). Read only: it never starts or stops them.',
      obj({ app: str('Optional: starnet, freellmapi or omniroute (default: all three)') }), READ,
      (a) => api('GET', '/v1/myapps/status' + (a && a.app ? '?app=' + enc(a.app) : ''))],
  ].map(([name, description, inputSchema, annotations, run]) => ({
    name, description, inputSchema, annotations, run,
    app: Object.keys(APPS).find((a) => name.startsWith(APPS[a].prefix)) || 'hub', // 'hub': app_hub_status, in every connector
  }));
}

// One app's connector: its tools plus status, named without the app's prefix.
function forApp(list, app) {
  return list.filter((t) => t.app === app || t.app === 'hub')
    .map((t) => ({ ...t, name: t.app === 'hub' ? 'status' : t.name.slice(APPS[app].prefix.length) }));
}

// What a connector tells the agent when it connects.
function instructions(app) {
  if (app === 'clipforge') {
    return 'ClipForge on this PC: AI clips from videos. make_clips with wait_minutes 9 does a whole video in one call - ' +
      'on a schedule, make only that call. If clips cannot be made, status says what to fix.';
  }
  if (app) return `${APPS[app].title} in App Hub on this PC.`;
  return 'App Hub runs ClipForge (AI clips from videos) and AI models on this PC. clipforge_make_clips with ' +
    'wait_minutes 9 does a whole video in one call - on a schedule, make only that call. If clips cannot be made, ' +
    'app_hub_status says what to fix.';
}

// One JSON-RPC message in, the reply out (null for notifications, which get no reply).
// Tool failures are results with isError, never protocol errors: a client like Starnet counts protocol
// errors against the connector and drops it after three, but shows isError text to the agent.
// opts: { onInit(clientInfo), instructions }
async function rpc(msg, list, { onInit, instructions: text = instructions() } = {}) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid request');
  if (id === undefined) return null; // notifications/initialized and friends
  if (method === 'initialize') {
    if (onInit) onInit(params?.clientInfo);
    return ok({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'app-hub', title: 'App Hub', version: '1.7.0' }, instructions: text });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') {
    return ok({ tools: list.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
  }
  if (method === 'tools/call') {
    const t = list.find((x) => x.name === params?.name);
    if (!t) return fail(-32602, 'Unknown tool: ' + params?.name);
    try {
      const out = await t.run(params.arguments || {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return ok({ content: [{ type: 'text', text: e.message }], isError: true });
    }
  }
  return fail(-32601, 'Method not found: ' + method);
}

module.exports = { tools, forApp, instructions, rpc, APPS };

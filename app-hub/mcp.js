// App Hub MCP connector: gives AI agents (Claude Code, Claude Desktop...) App Hub's apps as tools.
// It speaks MCP over stdio and calls the App Hub API on this PC, so App Hub must be running.
// Settings > Agent access shows the ready-made config (command, args, APP_HUB_KEY).
const BASE = process.env.APP_HUB_URL || 'http://127.0.0.1:8770';
const KEY = process.env.APP_HUB_KEY || '';

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(BASE + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + KEY, ...(body && { 'Content-Type': 'application/json' }) },
    });
  } catch {
    throw new Error('App Hub is not running on this PC. Open App Hub and try again.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.detail || `App Hub said ${r.status}`);
  return data;
}

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const TOOLS = [
  ['app_hub_status', 'What App Hub has: ClipForge state, which apps agents may use, version.', obj({}),
    () => api('GET', '/v1/status')],
  ['clipforge_make_clips', 'Start making short vertical clips from a YouTube link or a video file path on this PC. ' +
    'Returns the video id; check progress with clipforge_get_video.',
    obj({ input: str('YouTube link or full path of a video file. One per line for several.'),
      topic: str('Optional: what the clips should be about'),
      from_min: num('Optional: only look from this minute'), to_min: num('Optional: only look up to this minute') }, ['input']),
    (a) => api('POST', '/v1/clipforge/projects', a)],
  ['clipforge_list_videos', 'List the videos in ClipForge, newest first, with their status and clip count.', obj({}),
    () => api('GET', '/v1/clipforge/projects')],
  ['clipforge_get_video', 'One video: status, error, every clip (title, score, start/end, caption, file) and the ' +
    'folder on this PC where its files are.', obj({ id: str('Video id') }, ['id']),
    (a) => api('GET', `/v1/clipforge/projects/${encodeURIComponent(a.id)}`)],
  ['clipforge_transcript', 'The word-by-word transcript of a video, with times in seconds.', obj({ id: str('Video id') }, ['id']),
    (a) => api('GET', `/v1/clipforge/projects/${encodeURIComponent(a.id)}/transcript`)],
  ['clipforge_make_clip', 'Make a clip from a chosen part of a video (seconds). Same edit and HyperFrames graphics as the AI picks.',
    obj({ id: str('Video id'), start: num('Start, seconds'), end: num('End, seconds'), title: str('Optional hook title') }, ['id', 'start', 'end']),
    (a) => api('POST', `/v1/clipforge/projects/${encodeURIComponent(a.id)}/clips`, { start: a.start, end: a.end, title: a.title })],
  ['clipforge_edit_clip', 'Change a clip and re-render it: hook title, start/end (seconds), or corrected caption words.',
    obj({ id: str('Video id'), n: num('Clip number'), title: str('New hook title'), start: num('New start'), end: num('New end'),
      caption_text: str('The corrected caption words for the clip') }, ['id', 'n']),
    ({ id, n, ...patch }) => api('POST', `/v1/clipforge/projects/${encodeURIComponent(id)}/clips/${n}`, patch)],
  ['clipforge_title_ideas', 'Suggest other hook titles for a clip.', obj({ id: str('Video id'), n: num('Clip number') }, ['id', 'n']),
    (a) => api('POST', `/v1/clipforge/projects/${encodeURIComponent(a.id)}/clips/${a.n}/titles`)],
  ['clipforge_rerender_all', 'Re-render every clip of a video with the current settings.', obj({ id: str('Video id') }, ['id']),
    (a) => api('POST', `/v1/clipforge/projects/${encodeURIComponent(a.id)}/rerender_all`)],
  ['clipforge_styles', 'The HyperFrames choices: caption styles and shader transitions (values for clipforge_set_settings).', obj({}),
    () => api('GET', '/v1/clipforge/options')],
  ['clipforge_get_settings', 'ClipForge settings: clip count/length, caption style and position, hook style, transitions, ' +
    'motion graphics, music, AI model...', obj({}), () => api('GET', '/v1/clipforge/settings')],
  ['clipforge_set_settings', 'Change ClipForge settings (only the keys you pass). Applies to the next clips made or re-rendered.',
    obj({ settings: { type: 'object', description: 'e.g. {"caption_style":"neon","clip_count":8,"transitions":"bold"}' } }, ['settings']),
    (a) => api('POST', '/v1/clipforge/settings', a.settings)],
  ['clipforge_job', 'Progress of a ClipForge job (from the job id another tool returned).', obj({ job: str('Job id') }, ['job']),
    (a) => api('GET', `/v1/clipforge/jobs/${encodeURIComponent(a.job)}`)],
  ['models_overview', "This PC's hardware and every AI model with whether it fits, is installed, is in use.", obj({}),
    () => api('GET', '/v1/models')],
  ['models_download', 'Download an AI model. kind is "ollama" (chat) or "whisper" (speech).',
    obj({ kind: str('ollama or whisper'), id: str('Model id, e.g. qwen3:4b or small') }, ['kind', 'id']),
    (a) => api('POST', '/v1/models/download', a)],
  ['models_use', 'Switch ClipForge to an installed model.', obj({ kind: str('ollama or whisper'), id: str('Model id') }, ['kind', 'id']),
    (a) => api('POST', '/v1/models/use', a)],
  ['apps_list', "The user's own apps in App Hub (name and address).", obj({}), () => api('GET', '/v1/apps')],
];

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'app-hub', version: '1.0.0' } });
  }
  if (method === 'tools/list') {
    return reply(id, { tools: TOOLS.map(([name, description, inputSchema]) => ({ name, description, inputSchema })) });
  }
  if (method === 'tools/call') {
    const t = TOOLS.find(([name]) => name === params?.name);
    if (!t) return fail(id, -32602, 'Unknown tool: ' + params?.name);
    try {
      const out = await t[3](params.arguments || {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
    }
  }
  if (method === 'ping') return reply(id, {});
  if (id !== undefined) fail(id, -32601, 'Method not found: ' + method); // notifications get no answer
}

let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); continue; }
    handle(msg);
  }
});

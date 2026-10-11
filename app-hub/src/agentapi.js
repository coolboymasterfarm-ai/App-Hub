// The App Hub API: lets agents on this PC (e.g. Starnet's) use the hub's apps.
// Local only (127.0.0.1), every request needs a key, and each app can be switched off.
// Keys: one for all apps, and one per app that reaches only that app (Settings > Starnet & agents).
//   /v1/...       plain JSON API
//   /mcp          all apps as MCP tools over HTTP (what a Starnet connector connects to)
//   /mcp/<app>    one app's tools only, named without the app in front (clipforge: make_clips, ...)
const http = require('http');
const crypto = require('crypto');
const { tools, forApp, instructions, rpc, APPS } = require('../mcp-tools');

const PORT = 8770;
const newKey = (app) => 'ahk_' + (app ? app.slice(0, 2) + '_' : '') + crypto.randomBytes(24).toString('hex');

function keyOk(header, key) {
  const m = /^Bearer (.+)$/.exec(header || '');
  if (!m || !key) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Which key this is: 'all', an app, or null. keys: { all, clipforge, models, apps }.
const scopeOf = (header, keys) => Object.keys(keys).find((scope) => keyOk(header, keys[scope])) || null;
const mayUse = (scope, app) => scope === 'all' || scope === app;
const wrongKey = (app) => `This key is not for ${APPS[app].title}. Use ${APPS[app].title}'s key or the all-apps key (App Hub > Settings > Starnet & agents).`;

// Which app a path belongs to: /v1/<app>/... (status is allowed with any valid key).
const appOf = (p) => (/^\/v1\/(clipforge|models|apps)(\/|$)/.exec(p) || [])[1] || null;

// handlers: { status(), clipforge(method, rest, body), models(method, rest, body), apps(method, rest, body) }
// each returns { status: <number>, body } or a plain object (200).
// keys(): { all, clipforge, models, apps }. onAgent(clientName, scope): an MCP client connected with that key.
function start({ keys, allowed, handlers, onAgent = () => {}, port = PORT }) {
  async function route(method, pathAndQuery, body, scope) {
    const url = new URL(pathAndQuery, 'http://x');
    const p = url.pathname.replace(/\/+$/, '');
    try {
      if (p === '/v1/status') return { status: 200, body: await handlers.status() };
      const appName = appOf(p);
      if (!appName || !handlers[appName]) return { status: 404, body: { error: 'Unknown path. Try GET /v1/status' } };
      if (!mayUse(scope, appName)) return { status: 403, body: { error: wrongKey(appName) } };
      if (!allowed(appName)) return { status: 403, body: { error: `Agent access to ${APPS[appName].title} is switched off (App Hub > Settings > Starnet & agents)` } };
      const rest = p.slice(`/v1/${appName}`.length).replace(/^\//, '') + url.search;
      const r = await handlers[appName](method, rest, body);
      // { status: <number>, body } sets the HTTP status; anything else (e.g. a video with status "done") is the body
      return r && typeof r.status === 'number' && 'body' in r ? r : { status: 200, body: r };
    } catch (e) {
      return { status: 500, body: { error: e.message } };
    }
  }

  // MCP tools call the routes in-process with the caller's key scope; a failed route becomes the tool's error text.
  const toolsAs = (scope) => tools(async (method, p, body) => {
    const r = await route(method, p, body, scope);
    if (r.status >= 400) throw new Error((r.body && (r.body.error || r.body.detail)) || `App Hub said ${r.status}`);
    return r.body;
  });
  const lists = {}; // scope -> its tools, made once
  const listFor = (scope) => (lists[scope] = lists[scope] || toolsAs(scope));

  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    // Browsers send an Origin; a rebinding attack shows up as a foreign Host. Agents send neither.
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) {
      return send(403, { error: 'App Hub only accepts requests from programs on this PC' });
    }
    const scope = scopeOf(req.headers.authorization, keys());
    if (!scope) return send(401, { error: 'Missing or wrong API key (App Hub > Settings > Starnet & agents)' });
    let body = null;
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    } catch { return send(400, { error: 'The body must be JSON' }); }

    const m = /^\/mcp(?:\/(clipforge|models|apps))?$/.exec(req.url.split('?')[0].replace(/\/+$/, ''));
    if (m) {
      // Streamable HTTP, stateless: one JSON-RPC message (or a batch) per POST, the reply as JSON.
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'POST JSON-RPC to this address' }); }
      const app = m[1] || null;
      if (app && !mayUse(scope, app)) return send(403, { error: wrongKey(app) });
      // /mcp/<app>: that app's tools; /mcp: every tool the key may use (an app key there gets just its app's)
      const list = app ? forApp(listFor(scope), app) : listFor(scope).filter((t) => t.app === 'hub' || mayUse(scope, t.app));
      const opts = { onInit: (client) => onAgent((client && client.name) || 'an MCP client', app || scope), instructions: instructions(app) };
      const msgs = Array.isArray(body) ? body : [body];
      if (msgs.every((x) => x && x.id === undefined)) return send(202); // only notifications: nothing to answer
      // A tool may wait minutes for a video. fetch clients (Starnet's included) give up after 5 silent minutes,
      // so send the headers now and a space every 25 s - spaces before JSON are still valid JSON.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const beat = setInterval(() => res.write(' '), 25000);
      const replies = (await Promise.all(msgs.map((x) => rpc(x, list, opts)))).filter(Boolean);
      clearInterval(beat);
      return res.end(JSON.stringify(Array.isArray(body) ? replies : replies[0]));
    }
    const r = await route(req.method, req.url, body, scope);
    return send(r.status, r.body);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { start, newKey, keyOk, scopeOf, appOf, PORT };

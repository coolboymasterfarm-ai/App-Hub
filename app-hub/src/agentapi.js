// The App Hub API: lets agents on this PC (e.g. Starnet's) use the hub's apps.
// Local only (127.0.0.1), every request needs the key, and each app can be switched off.
const http = require('http');
const crypto = require('crypto');

const PORT = 8770;
const newKey = () => 'ahk_' + crypto.randomBytes(24).toString('hex');

function keyOk(header, key) {
  const m = /^Bearer (.+)$/.exec(header || '');
  if (!m || !key) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Which app a path belongs to: /v1/<app>/... (status is always allowed with a valid key).
const appOf = (p) => (/^\/v1\/(clipforge|models|apps)(\/|$)/.exec(p) || [])[1] || null;

// handlers: { status(), clipforge(method, rest, body), models(method, rest, body), apps(method, rest, body) }
// each returns { status?, body } or a plain object (200).
function start({ getKey, allowed, handlers, port = PORT }) {
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    // Browsers send an Origin; a rebinding attack shows up as a foreign Host. Agents send neither.
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) {
      return send(403, { error: 'App Hub only accepts requests from programs on this PC' });
    }
    if (!keyOk(req.headers.authorization, getKey())) return send(401, { error: 'Missing or wrong API key (Settings > Agent access)' });
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/\/+$/, '');
    let body = null;
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    } catch { return send(400, { error: 'The body must be JSON' }); }
    try {
      if (p === '/v1/status') return send(200, await handlers.status());
      const appName = appOf(p);
      if (!appName || !handlers[appName]) return send(404, { error: 'Unknown path. Try GET /v1/status' });
      if (!allowed(appName)) return send(403, { error: `Agent access to ${appName} is switched off (Settings > Agent access)` });
      const rest = p.slice(`/v1/${appName}`.length).replace(/^\//, '') + url.search;
      const r = await handlers[appName](req.method, rest, body);
      return r && r.status ? send(r.status, r.body) : send(200, r);
    } catch (e) {
      return send(500, { error: e.message });
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { start, newKey, keyOk, appOf, PORT };

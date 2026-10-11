const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { once } = require('events');
const agentapi = require('../src/agentapi');

// raw http.request, so the Host and Origin headers can be set like a browser or attacker would
function call(port, { method = 'GET', path = '/v1/status', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('App Hub API: key, local-only, switches, routing', async () => {
  const key = agentapi.newKey();
  const off = new Set();
  const seen = [];
  const srv = agentapi.start({
    port: 0, keys: () => ({ all: key }), allowed: (a) => !off.has(a),
    handlers: {
      status: () => ({ ok: true }),
      clipforge: (m, rest, body) => { seen.push([m, rest, body]); return { status: 201, body: { made: true } }; },
      models: () => ({ models: [] }),
      apps: () => [],
    },
  });
  await once(srv, 'listening');
  const port = srv.address().port;
  const auth = { Authorization: 'Bearer ' + key };
  try {
    assert.match(key, /^ahk_[0-9a-f]{48}$/);
    assert.strictEqual((await call(port)).status, 401);                                            // no key
    assert.strictEqual((await call(port, { headers: { Authorization: 'Bearer nope' } })).status, 401); // wrong key
    assert.strictEqual((await call(port, { headers: { ...auth, Origin: 'https://evil.example' } })).status, 403);
    assert.strictEqual((await call(port, { headers: { ...auth, Host: 'evil.example' } })).status, 403);
    assert.deepStrictEqual((await call(port, { headers: auth })).body, { ok: true });
    const r = await call(port, { method: 'POST', path: '/v1/clipforge/projects?x=1', headers: auth, body: '{"input":"a"}' });
    assert.deepStrictEqual([r.status, r.body, seen[0]], [201, { made: true }, ['POST', 'projects?x=1', { input: 'a' }]]);
    assert.strictEqual((await call(port, { method: 'POST', path: '/v1/clipforge/x', headers: auth, body: '{bad' })).status, 400);
    assert.strictEqual((await call(port, { path: '/v1/nope', headers: auth })).status, 404);
    off.add('clipforge');
    assert.strictEqual((await call(port, { path: '/v1/clipforge/projects', headers: auth })).status, 403); // switched off
    assert.strictEqual((await call(port, { path: '/v1/models', headers: auth })).status, 200);
  } finally {
    srv.close();
  }
});

test('App Hub MCP over HTTP (what Starnet connects to)', async () => {
  const key = agentapi.newKey();
  const off = new Set();
  const agents = [];
  const srv = agentapi.start({
    port: 0, keys: () => ({ all: key }), allowed: (a) => !off.has(a), onAgent: (n) => agents.push(n),
    handlers: {
      status: () => ({ ok: true }),
      clipforge: (m, rest, body) => (rest === 'run' ? { id: 'v1', status: 'done', got: body } : { status: 503, body: { error: 'ClipForge is stopped' } }),
      models: () => ({}), apps: () => [],
    },
  });
  await once(srv, 'listening');
  const port = srv.address().port;
  // exactly the headers Starnet's HTTP transport sends (sidecar/mcp/transport.http.js)
  const headers = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const rpc = (msg, h = headers) => call(port, { method: 'POST', path: '/mcp', headers: h, body: JSON.stringify(msg) });
  try {
    assert.strictEqual((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {})).status, 401);  // key needed here too
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'starnet-harness' } } });
    assert.strictEqual(init.body.result.protocolVersion, '2025-06-18');
    assert.deepStrictEqual(agents, ['starnet-harness']);
    assert.strictEqual((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const list = (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools;
    assert.strictEqual(list.length, 18);
    assert.ok(list.every((t) => t.inputSchema.type === 'object' && t.description));
    assert.strictEqual(list.find((t) => t.name === 'clipforge_list_videos').annotations.readOnlyHint, true);
    // a tool call runs the route in-process
    const ok = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'clipforge_make_clips', arguments: { input: 'https://youtu.be/abcdefghijk', wait_minutes: 9 } } });
    assert.deepStrictEqual(JSON.parse(ok.body.result.content[0].text), { id: 'v1', status: 'done', got: { input: 'https://youtu.be/abcdefghijk', wait_minutes: 9 } });
    // failures are tool results with isError (HTTP 200), so Starnet shows the reason and keeps the connector up
    const down = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'clipforge_list_videos', arguments: {} } });
    assert.deepStrictEqual([down.status, down.body.result.isError, down.body.result.content[0].text], [200, true, 'ClipForge is stopped']);
    off.add('clipforge');
    const offr = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'clipforge_make_clips', arguments: { input: 'x' } } });
    assert.match(offr.body.result.content[0].text, /switched off/);
    assert.strictEqual((await rpc({ jsonrpc: '2.0', id: 6, method: 'nope' })).body.error.code, -32601);
    assert.strictEqual((await call(port, { path: '/mcp', headers })).status, 405);
  } finally {
    srv.close();
  }
});

test('A key per app: each reaches only its app, and /mcp/<app> serves only its tools', async () => {
  const all = agentapi.newKey(), cf = agentapi.newKey('clipforge'), md = agentapi.newKey('models');
  const agents = [];
  const srv = agentapi.start({
    port: 0, keys: () => ({ all, clipforge: cf, models: md, apps: agentapi.newKey('apps') }), allowed: () => true,
    onAgent: (n, scope) => agents.push([n, scope]),
    handlers: { status: () => ({ ok: true }), clipforge: (m, rest) => ({ cf: rest }), models: () => ({ models: 1 }), apps: () => [] },
  });
  await once(srv, 'listening');
  const port = srv.address().port;
  const as = (k) => ({ Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' });
  const rpc = (p, k, msg) => call(port, { method: 'POST', path: p, headers: as(k), body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...msg }) });
  const names = async (p, k) => (await rpc(p, k, { method: 'tools/list' })).body.result.tools.map((t) => t.name);
  try {
    assert.match(cf, /^ahk_cl_[0-9a-f]{48}$/);
    // plain API: the ClipForge key reaches ClipForge and status, not AI Models
    assert.strictEqual((await call(port, { path: '/v1/clipforge/projects', headers: as(cf) })).status, 200);
    assert.strictEqual((await call(port, { path: '/v1/status', headers: as(cf) })).status, 200);
    const no = await call(port, { path: '/v1/models', headers: as(cf) });
    assert.deepStrictEqual([no.status, /not for AI Models/.test(no.body.error)], [403, true]);
    assert.strictEqual((await call(port, { path: '/v1/models', headers: as(all) })).status, 200);
    // per-app connector: short names, its key or the all-apps key, never another app's key
    const cfTools = await names('/mcp/clipforge', cf);
    assert.ok(cfTools.includes('make_clips') && cfTools.includes('status') && !cfTools.some((n) => /^models|^clipforge_/.test(n)), cfTools.join());
    assert.deepStrictEqual(await names('/mcp/models', md), ['status', 'overview', 'download', 'use']);
    assert.deepStrictEqual((await names('/mcp/models', all)).length, 4);
    assert.strictEqual((await rpc('/mcp/models', cf, { method: 'tools/list' })).status, 403);
    // the all-apps connector with an app key: that app's tools only (prefixed), and calls stay in scope
    assert.ok((await names('/mcp', cf)).every((n) => n === 'app_hub_status' || n.startsWith('clipforge_')));
    assert.strictEqual((await names('/mcp', all)).length, 18);
    const call1 = await rpc('/mcp/clipforge', cf, { method: 'tools/call', params: { name: 'list_videos', arguments: {} } });
    assert.deepStrictEqual(JSON.parse(call1.body.result.content[0].text), { cf: 'projects' });
    // who connected, and with which connector
    await rpc('/mcp/clipforge', cf, { method: 'initialize', params: { clientInfo: { name: 'starnet-harness' } } });
    const init = await rpc('/mcp/models', all, { method: 'initialize', params: { clientInfo: { name: 'x' } } });
    assert.match(init.body.result.instructions, /AI Models/);
    assert.deepStrictEqual(agents, [['starnet-harness', 'clipforge'], ['x', 'models']]);
  } finally {
    srv.close();
  }
});

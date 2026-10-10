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
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
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
    port: 0, getKey: () => key, allowed: (a) => !off.has(a),
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

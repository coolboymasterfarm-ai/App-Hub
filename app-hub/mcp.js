// App Hub MCP connector over stdio, for Claude Code / Claude Desktop. (Starnet connects over HTTP
// instead: http://127.0.0.1:8770/mcp.) It calls the App Hub API on this PC, so App Hub must be running.
// Settings > Starnet & agents > Claude Code copies the ready-made config (command, args, APP_HUB_KEY).
const fs = require('fs');
const http = require('http');
const path = require('path');
const { tools, rpc } = require('./mcp-tools');

const BASE = process.env.APP_HUB_URL || 'http://127.0.0.1:8770';
// mcp.js is copied next to hub-settings.json, so a key reset in App Hub needs no config change here.
function key() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'hub-settings.json'), 'utf8')).agentKey || process.env.APP_HUB_KEY || ''; }
  catch { return process.env.APP_HUB_KEY || ''; }
}

// http.request, not fetch: fetch gives up after 5 silent minutes, and making clips can wait up to 9.5.
function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + p, { method, headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(d); } catch { /* not JSON */ }
        if (res.statusCode >= 400) reject(new Error(data.error || data.detail || `App Hub said ${res.statusCode}`));
        else resolve(data);
      });
    });
    req.on('error', () => reject(new Error('App Hub is not running on this PC. Open App Hub and try again.')));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

const list = tools(api);
const out = (m) => m && process.stdout.write(JSON.stringify(m) + '\n');

let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    rpc(msg, list).then(out);
  }
});

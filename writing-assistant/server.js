// Writing Assistant server: serves the static app and exposes a config API.
// App Hub starts this on a fixed port; the endpoint and API key are set in App Hub Settings.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5092;
const DIR = __dirname;
// Config lives next to App Hub's user data (where main.js writes hub-settings.json).
const CONFIG_FILE = path.join(path.dirname(process.execPath), 'writing-assistant-config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, reqUrl) => {
  const url = new URL(reqUrl, `http://127.0.0.1:${PORT}`);

  // Config API: GET returns current endpoint/key, POST saves them.
  if (url.pathname === '/api/config') {
    if (req.method === 'GET') {
      const cfg = readConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ endpoint: cfg.endpoint || null, hasKey: !!cfg.apiKey }));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', () => {
        try {
          const cfg = { ...readConfig(), ...JSON.parse(body) };
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
    res.writeHead(405); res.end(); return;
  }

  // Serve index.html with config injected as a global.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const cfg = readConfig();
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const injected = `<script>window.FREELLM_ENDPOINT = ${JSON.stringify(cfg.endpoint || '')};
      window.FREELLM_API_KEY = ${JSON.stringify(cfg.apiKey || '')};</script>`;
    const merged = html.replace('</head>', injected + '</head>');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(merged);
  }

  // Static files.
  const filePath = path.join(DIR, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
  serveFile(res, filePath, types[ext] || 'application/octet-stream');
});

server.listen(PORT, '127.0.0.1', () => console.log(`Writing Assistant on port ${PORT}`));
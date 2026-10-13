// The same "clips ready" message as Telegram, posted to a Discord channel through a webhook
// (Discord: channel > Edit Channel > Integrations > Webhooks > New Webhook > Copy Webhook URL). Pure Node.
const URL_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w-]{20,}$/;

function check(url) {
  if (!URL_RE.test(String(url || '').trim())) throw new Error('That Discord webhook address looks wrong. It starts with https://discord.com/api/webhooks/');
}

async function send(url, text, fetchFn = fetch) {
  check(url);
  const r = await fetchFn(String(url).trim(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ content: String(text).slice(0, 2000), username: 'App Hub', allowed_mentions: { parse: [] } }),
  });
  if (r.ok) return true;
  let why = `HTTP ${r.status}`;
  try { why = (await r.json()).message || why; } catch { /* not JSON */ }
  throw new Error(r.status === 404 ? 'Discord: that webhook no longer exists. Make a new one and paste it again.' : `Discord: ${why}`);
}

// The webhook as Settings shows it: the secret part hidden.
const mask = (url) => (url ? String(url).replace(/\/[\w-]+$/, (t) => '/••••' + t.slice(-4)) : '');

module.exports = { check, send, mask };

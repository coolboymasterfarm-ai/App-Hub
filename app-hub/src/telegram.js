// A short Telegram message when a ClipForge video is ready, sent by a Telegram bot (e.g. the one your Starnet
// uses) to your chat. App Hub only sends; it never reads the bot's messages, so Starnet keeps receiving them.
// Pure Node (fetch is passed in for tests).

// Throws a readable error for a token or chat id that can't be right.
function check(token, chat) {
  if (!/^\d{5,}:[\w-]{30,}$/.test(String(token || '').trim())) throw new Error('That bot token looks wrong. It looks like 123456789:AAH... (from @BotFather).');
  if (!/^(-?\d{3,}|@\w{4,})$/.test(String(chat || '').trim())) throw new Error('The chat ID is a number like 123456789 (or -100... for a group).');
}

// "🎬 Clips ready: <title> · 5 clips. Best: <title> (87)"
function finishedText(p) {
  const done = (p.clips || []).filter((c) => c.state === 'done' && c.file);
  const best = [...done].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
  const lines = [`🎬 Clips ready: ${p.title || 'your video'} · ${done.length} clip${done.length === 1 ? '' : 's'}`];
  if (best) lines.push(`Best: ${best.title}${best.score != null ? ` (${best.score})` : ''}`);
  return lines.join('\n').slice(0, 1000);
}

async function send(token, chat, text, fetchFn = fetch) {
  check(token, chat);
  const r = await fetchFn(`https://api.telegram.org/bot${String(token).trim()}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ chat_id: String(chat).trim(), text, disable_web_page_preview: true }),
  });
  let j = {};
  try { j = await r.json(); } catch { /* not JSON */ }
  if (!r.ok || !j.ok) {
    const why = j.description || `HTTP ${r.status}`;
    throw new Error(/chat not found/i.test(why) ? 'Telegram: chat not found. Send your bot a message first, then check the chat ID.'
      : /unauthorized/i.test(why) ? 'Telegram: the bot token was refused.' : `Telegram: ${why}`);
  }
  return true;
}

// The token as Settings shows it: never the whole thing.
const mask = (token) => (token ? '••••' + String(token).slice(-4) : '');

module.exports = { check, finishedText, send, mask };

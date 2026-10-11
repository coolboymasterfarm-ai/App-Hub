// Per-key "last used" time and expiry, and the last 50 agent calls (Settings > Starnet & agents). Pure logic, tested.
const DAY = 86400000;
const MAX = 50;
const DAYS = [0, 7, 30, 90, 365]; // 0: never expires

// A key made at `made` that lives `days` days: when it stops working (null: never).
const expiresAt = (made, days) => (Number(days) > 0 && Number(made) > 0 ? Number(made) + Number(days) * DAY : null);
const isExpired = (made, days, now = Date.now()) => { const e = expiresAt(made, days); return e !== null && now >= e; };

// state: { lastUsed: { scope: ms }, calls: [newest first] }. A call with a tool is logged; any call marks the key used.
function record(state, { scope, client, tool, ok = true, ms = 0, at = Date.now() }) {
  const lastUsed = { ...(state && state.lastUsed), [scope]: at };
  let calls = (state && state.calls) || [];
  if (tool) calls = [{ at, scope, client: client || 'unknown agent', tool: String(tool).slice(0, 80), ok: !!ok, ms: Math.round(ms) }, ...calls].slice(0, MAX);
  return { lastUsed, calls };
}

// Read a saved state, dropping anything that isn't one.
function clean(state) {
  const s = state && typeof state === 'object' ? state : {};
  return {
    lastUsed: s.lastUsed && typeof s.lastUsed === 'object' ? s.lastUsed : {},
    calls: Array.isArray(s.calls) ? s.calls.filter((c) => c && c.at && c.tool).slice(0, MAX) : [],
  };
}

module.exports = { expiresAt, isExpired, record, clean, DAYS, MAX };

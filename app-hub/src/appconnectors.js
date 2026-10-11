// Every app the user adds gets its own agent connector: /mcp/<app id>, its own key and a Starnet id made from
// its name. The key is made when the app is added and deleted when it's removed. Pure logic, tested.
const isUserApp = (scope) => /^app-[a-z0-9]+$/.test(String(scope || ''));

// "My Notes!" -> "mynotes"; unique among the ids already taken ("mynotes-2", ...).
function starnetId(name, taken) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'app';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

// One connector per added app, after the built-in ones (whose ids are taken).
function userConnectors(list, builtIn) {
  const taken = new Set(builtIn.map((c) => c.id));
  return list.map((a) => ({ scope: a.id, title: a.name, path: '/mcp/' + a.id, id: starnetId(a.name, taken), sw: 'agentApps', user: true }));
}

// Make keys for connectors that have none, and drop the keys of removed apps. Returns true when s changed.
// s: hub settings ({ appKeys, keyMade, keyDays }); scopes: every connector scope but 'all'.
function syncKeys(s, scopes, newKey, now = Date.now()) {
  let changed = false;
  s.appKeys = { ...s.appKeys };
  s.keyMade = { ...s.keyMade };
  s.keyDays = { ...s.keyDays };
  for (const scope of scopes) {
    if (!s.appKeys[scope]) { s.appKeys[scope] = newKey(scope); s.keyMade[scope] = now; changed = true; }
    if (!s.keyMade[scope]) { s.keyMade[scope] = now; changed = true; }
  }
  if (!s.keyMade.all) { s.keyMade.all = now; changed = true; }
  for (const scope of Object.keys(s.appKeys)) {
    if (isUserApp(scope) && !scopes.includes(scope)) {
      delete s.appKeys[scope]; delete s.keyMade[scope]; delete s.keyDays[scope]; changed = true;
    }
  }
  return changed;
}

module.exports = { isUserApp, starnetId, userConnectors, syncKeys };

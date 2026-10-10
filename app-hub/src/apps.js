// The user's own app list: address checks and add/remove. Pure logic, tested with `node --test`.
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

// Returns a loadable URL, or throws an Error with a message the user can read.
function toUrl(address) {
  const a = String(address || '').trim().replace(/^"(.*)"$/, '$1');
  if (!a) throw new Error('Type an address.');
  if (/^https?:\/\//i.test(a)) {
    try { return new URL(a).href; } catch { throw new Error('That web address is not valid.'); }
  }
  if (/^file:\/\//i.test(a) || /\.html?$/i.test(a)) {
    let p;
    try { p = /^file:/i.test(a) ? fileURLToPath(a) : path.resolve(a); } catch { throw new Error('That file address is not valid.'); }
    if (!fs.existsSync(p)) throw new Error('That file does not exist.');
    return pathToFileURL(p).href;
  }
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(a)) return toUrl('http://' + a);
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(a)) return toUrl('https://' + a);
  throw new Error('Use a web address (https://...), http://localhost:PORT, or a .html file.');
}

function load(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((x) => x && x.id && x.name && x.url) : [];
  } catch { return []; }
}

function save(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(list, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function add(list, name, address) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Give the app a name.');
  if (n.length > 40) throw new Error('Keep the name under 40 characters.');
  return [...list, { id: 'app-' + Date.now().toString(36), name: n, url: toUrl(address) }];
}

const remove = (list, id) => list.filter((a) => a.id !== id);

module.exports = { toUrl, load, save, add, remove };

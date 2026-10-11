// Builds app-hub-clipforge.starnet-skill.json from skills/app-hub-clipforge/ - the file Starnet imports with
// CONNECT > ABILITIES > SKILL EXCHANGE > IMPORT EXPORTED PACKAGE. Run it after editing the skill:
//   node starnet/make-skill-package.js
// The digest follows Starnet's open-agent-skill-package/v1 format (sidecar/skills/package-format.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SKILL = path.join(__dirname, 'skills', 'app-hub-clipforge');
const OUT = path.join(__dirname, 'app-hub-clipforge.starnet-skill.json');

function build() {
  const files = fs.readdirSync(SKILL).sort().map((name) => ({ path: name, bytes: fs.readFileSync(path.join(SKILL, name)) }));
  const h = crypto.createHash('sha256').update(Buffer.from('StarNet skill package\0v1\0'));
  for (const f of files) {
    const p = Buffer.from(f.path, 'utf8');
    const len = Buffer.alloc(12);
    len.writeUInt32BE(p.length, 0);
    len.writeBigUInt64BE(BigInt(f.bytes.length), 4);
    h.update(len).update(p).update(f.bytes);
  }
  return JSON.stringify({
    format: 'open-agent-skill-package/v1', digest: h.digest('hex'), bytes: files.reduce((n, f) => n + f.bytes.length, 0),
    metadata: { title: 'App Hub ClipForge', category: 'Creator' },
    files: files.map((f) => ({ path: f.path, encoding: 'base64', content: f.bytes.toString('base64'), bytes: f.bytes.length,
      sha256: crypto.createHash('sha256').update(f.bytes).digest('hex') })),
  }, null, 2) + '\n';
}

if (require.main === module) { fs.writeFileSync(OUT, build()); console.log('Wrote', OUT); }
module.exports = { build, OUT };

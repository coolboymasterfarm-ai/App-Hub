const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pkg = require('../../starnet/make-skill-package');

const DIR = path.join(__dirname, '..', '..', 'starnet');

test('Starnet skill package is up to date with SKILL.md (run: node starnet/make-skill-package.js)', () => {
  assert.strictEqual(fs.readFileSync(pkg.OUT, 'utf8'), pkg.build());
  const skill = fs.readFileSync(path.join(DIR, 'skills', 'app-hub-clipforge', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: app-hub-clipforge\ndescription: "[^"]{1,280}"\n/);
  assert.doesNotMatch(skill, /https?:\/\//); // Starnet's skill guard holds back skills with links
});

test('Starnet recipes: name, task and every {token} has a param', () => {
  for (const f of fs.readdirSync(path.join(DIR, 'recipes'))) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, 'recipes', f), 'utf8'));
    assert.ok(r.starnetRecipe === 1 && r.name && r.task, f);
    const keys = new Set(r.params.map((p) => p.key));
    for (const [, k] of r.task.matchAll(/\{(\w+)\}/g)) assert.ok(keys.has(k), `${f}: {${k}} has no param`);
    assert.match(r.task, /mcp__apphub__clipforge_make_clips/);
  }
});

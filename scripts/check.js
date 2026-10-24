'use strict';
// Syntax-checks every .js file (node --check), validates settings.json and the ENV: resolver.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'data']);
let failed = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); }
      catch (err) { failed++; console.error('FAIL', path.relative(root, p), '\n', String(err.stderr || err)); }
    }
  }
}
walk(root);
try {
  const s = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'));
  const { resolveEnv } = require('../core/util');
  process.env.__T = 'ok';
  if (resolveEnv('ENV:__T') !== 'ok' || resolveEnv('ENV:__MISSING|dflt') !== 'dflt') throw new Error('ENV resolver broken');
  if (!Array.isArray(s.accounts)) throw new Error('settings.accounts must be an array');
} catch (e) { failed++; console.error('settings.json check failed:', e.message); }
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('All checks passed');

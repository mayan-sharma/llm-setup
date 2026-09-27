#!/usr/bin/env node
// Feature-map freshness check. Reads <map>/README.md (index, `mapped_at` SHA) and
// <map>/<feature>.md files (`paths` globs), then reports features touched since the map
// was written, changed files no feature claims, and globs that match nothing.
// Usage: node feature_map.mjs status [--repo .] [--map .agents/feature-map] [--json]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'status';
if (command !== 'status') {
  console.error(`unknown command: ${command} (expected: status)`);
  process.exit(2);
}
const repo = path.resolve(opt('--repo', '.'));
const mapRel = opt('--map', '.agents/feature-map').replace(/\\/g, '/').replace(/\/$/, '');
const mapDir = path.join(repo, mapRel);
const asJson = args.includes('--json');

const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const lines = s => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// Minimal frontmatter reader: scalars, `key: [a, b]`, and `key:` followed by `- item` lines.
function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { out[listKey].push(unquote(item[1])); continue; }
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === '') { out[key] = []; listKey = key; continue; }
    listKey = null;
    const inline = value.match(/^\[(.*)\]$/);
    out[key] = inline ? inline[1].split(',').map(unquote).filter(Boolean) : unquote(value);
  }
  return out;
}
function unquote(s) { return s.trim().replace(/^(['"])(.*)\1$/, '$2'); }

// Glob -> RegExp. `**` spans directories, `*`/`?` stay within one segment, and a plain
// path also matches everything beneath it.
function globToRegExp(glob) {
  const g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  if (!/[*?]/.test(g)) re = `${re.replace(/\/$/, '')}(?:/.*)?`;
  return new RegExp(`^${re}$`);
}

function fail(message) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`feature-map: ${message}`);
  process.exit(1);
}

try { git('rev-parse', '--is-inside-work-tree'); } catch { fail(`not a git repository: ${repo}`); }
const indexFile = path.join(mapDir, 'README.md');
if (!existsSync(indexFile)) fail(`no map at ${mapRel} (missing README.md); build one first`);

const index = frontmatter(indexFile);
const ignore = [mapRel, ...(Array.isArray(index.ignore) ? index.ignore : [])].map(globToRegExp);
const features = readdirSync(mapDir)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .map(f => {
    const fm = frontmatter(path.join(mapDir, f));
    const paths = Array.isArray(fm.paths) ? fm.paths : fm.paths ? [fm.paths] : [];
    return { feature: fm.feature || f.replace(/\.md$/, ''), file: `${mapRel}/${f}`, paths, res: paths.map(globToRegExp) };
  });

const sha = typeof index.mapped_at === 'string' ? index.mapped_at : '';
let baseValid = false;
if (sha) { try { git('cat-file', '-e', `${sha}^{commit}`); baseValid = true; } catch {} }

const tracked = lines(git('ls-files'));
const changed = baseValid
  ? [...new Set([...lines(git('diff', '--name-only', sha, '--')), ...lines(git('ls-files', '--others', '--exclude-standard'))])]
      .filter(f => !ignore.some(r => r.test(f)))
  : [];
const commitsSince = baseValid ? Number(git('rev-list', '--count', `${sha}..HEAD`).trim()) : null;

const stale = [];
const fresh = [];
const deadPaths = [];
const unpathed = [];
for (const f of features) {
  if (!f.paths.length) unpathed.push(f.feature);
  f.paths.forEach((p, i) => { if (!tracked.some(t => f.res[i].test(t))) deadPaths.push({ feature: f.feature, path: p }); });
  const hits = changed.filter(c => f.res.some(r => r.test(c)));
  if (hits.length) stale.push({ feature: f.feature, file: f.file, changed: hits });
  else fresh.push(f.feature);
}
const unmapped = changed.filter(c => !features.some(f => f.res.some(r => r.test(c))));

const report = {
  ok: true,
  map: mapRel,
  mapped_at: sha || null,
  base_valid: baseValid,
  commits_since: commitsSince,
  features: features.length,
  stale,
  unmapped,
  dead_paths: deadPaths,
  unpathed,
  fresh,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const short = sha ? sha.slice(0, 10) : 'none';
  console.log(`feature-map: ${mapRel} | ${features.length} features | mapped_at ${short}${baseValid ? ` (${commitsSince} commits ago)` : ''}`);
  if (!baseValid) console.log(`  mapped_at ${sha ? 'is not a commit in this repo' : 'is missing'}: freshness unknown, re-verify every feature and set mapped_at`);
  const list = (title, items, fmt) => {
    if (!items.length) return;
    console.log(`${title} (${items.length}):`);
    for (const it of items.slice(0, 50)) console.log(`  ${fmt(it)}`);
    if (items.length > 50) console.log(`  ... ${items.length - 50} more`);
  };
  list('Stale features', stale, s => `${s.feature}: ${s.changed.length} changed (${s.changed.slice(0, 4).join(', ')}${s.changed.length > 4 ? ', ...' : ''})`);
  list('Unmapped changes', unmapped, f => f);
  list('Dead paths', deadPaths, d => `${d.feature}: ${d.path}`);
  list('Features without paths', unpathed, f => f);
  if (baseValid && !stale.length && !unmapped.length && !deadPaths.length) console.log('Map is fresh.');
}

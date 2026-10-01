#!/usr/bin/env node
// Feature-map checks. Reads <map>/README.md (index, `mapped_at` SHA, `ignore` globs) and
// <map>/<feature>.md files (`paths` globs, optional `verified_at` SHA).
//   status   - features touched since they were last verified, changed files no feature
//              claims, and globs that match nothing.
//   coverage - tracked files no feature claims, files shared by several features, and lint
//              (template sections, `related` targets, frontmatter the parser could not read).
// Usage: node feature_map.mjs <status|coverage> [--repo .] [--map .agents/feature-map] [--json] [--strict]
// --strict exits 1 when the report has anything to fix, so CI or hooks can gate on it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const COMMANDS = ['status', 'coverage'];
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'status';
if (!COMMANDS.includes(command)) {
  console.error(`unknown command: ${command} (expected: ${COMMANDS.join(' | ')})`);
  process.exit(2);
}
const repo = path.resolve(opt('--repo', '.'));
const mapDir = path.resolve(repo, opt('--map', '.agents/feature-map'));
const mapRel = path.relative(repo, mapDir).replace(/\\/g, '/');
const mapInRepo = mapRel !== '' && !mapRel.startsWith('..') && !path.isAbsolute(mapRel);
const mapLabel = mapInRepo ? mapRel : mapDir;
const asJson = args.includes('--json');
const strict = args.includes('--strict');

const SECTIONS = ['User flow', 'Entry points', 'How it works', 'Invariants', 'Exercise it', 'Gotchas'];

const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const gitOk = (...a) => { try { git(...a); return true; } catch { return false; } };
const lines = s => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// Frontmatter reader for the YAML subset maps use: scalars (plain, quoted, `>`/`|` blocks,
// indented continuation lines), `key: [a, "b, c"]`, and `key:` followed by `- item` lines
// (indented or not). Trailing ` # comments` are dropped. Lines it cannot read become warnings.
function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  const warnings = [];
  if (!m) return { data: out, warnings: ['no frontmatter block'], body: readFileSync(file, 'utf8') };
  const rows = m[1].split(/\r?\n/);
  let listKey = null;
  let scalarKey = null;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const item = raw.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { out[listKey].push(clean(item[1])); continue; }
    const kv = raw.match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
    if (kv) {
      const key = kv[1];
      const value = stripComment(kv[2] || '');
      listKey = null;
      scalarKey = null;
      if (value === '') { out[key] = []; listKey = key; continue; }
      const block = value.match(/^([>|])[-+]?$/);
      if (block) {
        const parts = [];
        while (i + 1 < rows.length && (/^\s+\S/.test(rows[i + 1]) || !rows[i + 1].trim())) parts.push(rows[++i].trim());
        out[key] = parts.filter(Boolean).join(block[1] === '>' ? ' ' : '\n');
        continue;
      }
      const inline = value.match(/^\[(.*)\]$/);
      if (inline) { out[key] = splitInline(inline[1]); continue; }
      out[key] = clean(value);
      scalarKey = key;
      continue;
    }
    if (scalarKey && /^\s+\S/.test(raw)) { out[scalarKey] = `${out[scalarKey]} ${raw.trim()}`; continue; }
    warnings.push(`unparsed frontmatter line: ${raw.trim()}`);
  }
  return { data: out, warnings, body: readFileSync(file, 'utf8').slice(m[0].length) };
}
function stripComment(s) {
  const t = s.trim();
  const q = t.match(/^(['"])(.*?)\1/);
  if (q) return q[0];
  return t.replace(/\s+#.*$/, '');
}
function clean(s) { return stripComment(s).replace(/^(['"])(.*)\1$/, '$2'); }
function splitInline(s) {
  const items = [];
  let cur = '';
  let quote = null;
  for (const c of s) {
    if (quote) { if (c === quote) quote = null; cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === ',') { items.push(cur); cur = ''; continue; }
    cur += c;
  }
  items.push(cur);
  return items.map(clean).filter(Boolean);
}

// Glob -> RegExp. `**` spans directories, `*`/`?` stay within one segment, and a plain
// path also matches everything beneath it. Matching is case-sensitive, like git.
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
// `paths` entries starting with `!` exclude files the other entries would claim.
function matcher(globs) {
  const inc = globs.filter(g => !g.startsWith('!')).map(globToRegExp);
  const exc = globs.filter(g => g.startsWith('!')).map(g => globToRegExp(g.slice(1)));
  return f => inc.some(r => r.test(f)) && !exc.some(r => r.test(f));
}

function fail(message) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`feature-map: ${message}`);
  process.exit(1);
}

if (!gitOk('rev-parse', '--is-inside-work-tree')) fail(`not a git repository: ${repo}`);
const indexFile = path.join(mapDir, 'README.md');
if (!existsSync(indexFile)) fail(`no map at ${mapLabel} (missing README.md); build one first`);

const indexFm = frontmatter(indexFile);
const index = indexFm.data;
const ignoreGlobs = [...(mapInRepo ? [mapRel] : []), ...(Array.isArray(index.ignore) ? index.ignore : [])];
const isIgnored = f => ignoreGlobs.some(g => globToRegExp(g).test(f));

const isCommit = sha => typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) && gitOk('cat-file', '-e', `${sha}^{commit}`);
const isAncestor = (a, b) => gitOk('merge-base', '--is-ancestor', a, b);

const mappedAt = typeof index.mapped_at === 'string' ? index.mapped_at : '';
const baseValid = isCommit(mappedAt);
const baseInHistory = baseValid && isAncestor(mappedAt, 'HEAD');

const features = readdirSync(mapDir)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .sort()
  .map(f => {
    const { data, warnings, body } = frontmatter(path.join(mapDir, f));
    const paths = Array.isArray(data.paths) ? data.paths : data.paths ? [data.paths] : [];
    const related = Array.isArray(data.related) ? data.related : data.related ? [data.related] : [];
    const verifiedAt = typeof data.verified_at === 'string' ? data.verified_at : '';
    const verifiedValid = isCommit(verifiedAt);
    // A feature's base is the newer of its own `verified_at` and the index `mapped_at`.
    let base = baseValid ? mappedAt : '';
    if (verifiedValid && (!base || !isAncestor(verifiedAt, base))) base = verifiedAt;
    return {
      feature: data.feature || f.replace(/\.md$/, ''),
      name: f.replace(/\.md$/, ''),
      file: `${mapLabel}/${f}`,
      paths,
      related,
      verifiedAt,
      verifiedValid,
      base,
      body,
      warnings,
      matches: matcher(paths),
    };
  });

const tracked = lines(git('ls-files'));
const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
const changedCache = new Map();
const changedSince = sha => {
  if (!changedCache.has(sha)) {
    changedCache.set(sha, [...new Set([...lines(git('diff', '--name-only', sha, '--')), ...untracked])].filter(f => !isIgnored(f)));
  }
  return changedCache.get(sha);
};

const parseWarnings = [
  ...indexFm.warnings.map(w => ({ file: `${mapLabel}/README.md`, warning: w })),
  ...features.flatMap(f => f.warnings.map(w => ({ file: f.file, warning: w }))),
  ...features.filter(f => f.verifiedAt && !f.verifiedValid).map(f => ({ file: f.file, warning: `verified_at ${f.verifiedAt} is not a commit in this repo; using mapped_at` })),
];

let report;
if (command === 'status') {
  const stale = [];
  const fresh = [];
  const deadPaths = [];
  const unpathed = [];
  for (const f of features) {
    if (!f.paths.length) unpathed.push(f.feature);
    f.paths.filter(p => !p.startsWith('!')).forEach(p => {
      const re = globToRegExp(p);
      if (!tracked.some(t => re.test(t))) deadPaths.push({ feature: f.feature, path: p });
    });
    const hits = f.base ? changedSince(f.base).filter(f.matches) : [];
    if (hits.length) stale.push({ feature: f.feature, file: f.file, since: f.base, changed: hits });
    else fresh.push(f.feature);
  }
  const unmapped = baseValid ? changedSince(mappedAt).filter(c => !features.some(f => f.matches(c))) : [];
  const commitsSince = baseInHistory ? Number(git('rev-list', '--count', `${mappedAt}..HEAD`).trim()) : null;
  const problems = !baseValid || !baseInHistory || stale.length || unmapped.length || deadPaths.length || unpathed.length;
  report = {
    ok: true, command, map: mapLabel, mapped_at: mappedAt || null, base_valid: baseValid, base_in_history: baseInHistory,
    commits_since: commitsSince, features: features.length, stale, unmapped, dead_paths: deadPaths, unpathed, fresh,
    warnings: parseWarnings, clean: !problems,
  };
  if (!asJson) {
    const short = mappedAt ? mappedAt.slice(0, 10) : 'none';
    console.log(`feature-map: ${mapLabel} | ${features.length} features | mapped_at ${short}${commitsSince !== null ? ` (${commitsSince} commits ago)` : ''}`);
    if (!baseValid) console.log(`  mapped_at ${mappedAt ? 'is not a commit in this repo' : 'is missing'}: freshness unknown, re-verify every feature and set mapped_at`);
    else if (!baseInHistory) console.log('  mapped_at is not an ancestor of HEAD (rebase, squash, or another branch): diffs may include unrelated history, re-verify stale features and reset mapped_at');
    printList('Stale features', stale, s => `${s.feature}: ${s.changed.length} changed since ${s.since.slice(0, 10)} (${s.changed.slice(0, 4).join(', ')}${s.changed.length > 4 ? ', ...' : ''})`);
    printList('Unmapped changes', unmapped, f => f);
    printList('Dead paths', deadPaths, d => `${d.feature}: ${d.path}`);
    printList('Features without paths', unpathed, f => f);
    printList('Warnings', parseWarnings, w => `${w.file}: ${w.warning}`);
    if (!problems) console.log('Map is fresh.');
  }
} else {
  const unclaimed = [];
  const shared = [];
  for (const t of tracked) {
    if (isIgnored(t)) continue;
    const owners = features.filter(f => f.matches(t)).map(f => f.feature);
    if (!owners.length) unclaimed.push(t);
    else if (owners.length > 1) shared.push({ file: t, features: owners });
  }
  const names = new Set(features.map(f => f.feature));
  const lint = [];
  for (const f of features) {
    if (f.feature !== f.name) lint.push({ file: f.file, issue: `feature "${f.feature}" does not match file name "${f.name}"` });
    for (const r of f.related) if (!names.has(r)) lint.push({ file: f.file, issue: `related "${r}" is not a feature` });
    for (const s of SECTIONS) if (!new RegExp(`^## ${s}\\s*$`, 'm').test(f.body)) lint.push({ file: f.file, issue: `missing section "## ${s}"` });
  }
  const problems = unclaimed.length || lint.length || parseWarnings.length;
  report = {
    ok: true, command, map: mapLabel, features: features.length, tracked: tracked.length,
    ignored: tracked.filter(isIgnored).length, unclaimed, shared, lint, warnings: parseWarnings, clean: !problems,
  };
  if (!asJson) {
    console.log(`feature-map coverage: ${mapLabel} | ${features.length} features | ${tracked.length} tracked, ${report.ignored} ignored, ${unclaimed.length} unclaimed, ${shared.length} shared`);
    printList('Unclaimed tracked files', unclaimed, f => f);
    printList('Shared files (expected for code several features run through)', shared, s => `${s.file}: ${s.features.join(', ')}`);
    printList('Lint', lint, l => `${l.file}: ${l.issue}`);
    printList('Warnings', parseWarnings, w => `${w.file}: ${w.warning}`);
    if (!problems) console.log('Coverage is complete.');
  }
}

if (asJson) console.log(JSON.stringify(report, null, 2));
process.exit(strict && !report.clean ? 1 : 0);

function printList(title, items, fmt) {
  if (!items.length) return;
  console.log(`${title} (${items.length}):`);
  for (const it of items.slice(0, 50)) console.log(`  ${fmt(it)}`);
  if (items.length > 50) console.log(`  ... ${items.length - 50} more`);
}

#!/usr/bin/env node
// Unified cross-harness environment CLI: push skills, sync a machine, inspect
// targets, and lint skills for portability.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const command = args[0];
const has = flag => args.includes(flag);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const die = message => { console.error(`ERROR: ${message}`); process.exit(2); };
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const run = (program, runArgs, opts = {}) => execFileSync(program, runArgs, {
  encoding: 'utf8', stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', cwd: opts.cwd,
});
const capture = (program, runArgs, cwd) => { try { return run(program, runArgs, { cwd, capture: true }).trim(); } catch { return ''; } };
const expandHome = input => input ? path.resolve(input.replace(/^~(?=$|[\\/])/, os.homedir())) : input;

const COMMANDS = ['push', 'sync', 'status', 'install', 'targets', 'doctor'];
if (!COMMANDS.includes(command)) die(`usage: agents.mjs ${COMMANDS.join('|')} ...`);

// Locate the bootstrap repo: explicit flag, walk up from the CLI/cwd, or the
// bootstrap-source.json written into an adapter home at install time.
function findRepo() {
  if (value('--repo')) return path.resolve(value('--repo'));
  const looksLikeRepo = dir => existsSync(path.join(dir, 'home', 'skills')) && existsSync(path.join(dir, 'adapters'));
  for (const start of [path.dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let current = start;
    for (;;) {
      if (looksLikeRepo(current)) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  for (const home of ['~/.agents', '~/.codex', '~/.claude', '~/.pi/agent']) {
    const metadata = path.join(expandHome(home), 'bootstrap-source.json');
    if (existsSync(metadata)) {
      try {
        const repo = JSON.parse(readFileSync(metadata, 'utf8').replace(/^﻿/, '')).repository;
        if (repo && existsSync(repo)) return path.resolve(repo);
      } catch {}
    }
  }
  die('cannot locate the bootstrap repository; pass --repo PATH');
}

const repo = findRepo();
const installer = path.join(repo, 'scripts', 'install.mjs');
const verifier = path.join(repo, 'scripts', 'verify.mjs');

function loadAdapters() {
  const dir = path.join(repo, 'adapters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(n => n.endsWith('.json')).sort()
    .map(n => JSON.parse(readFileSync(path.join(dir, n), 'utf8')));
}

function isDetected(adapter) {
  const d = adapter.detect || {};
  if ((d.env || []).some(name => process.env[name])) return true;
  if ((d.paths || []).some(p => existsSync(expandHome(p)))) return true;
  if ((d.bin || []).some(bin => {
    try { execFileSync(process.platform === 'win32' ? 'where' : 'command',
      process.platform === 'win32' ? [bin] : ['-v', bin], { stdio: 'ignore', shell: process.platform !== 'win32' }); return true; }
    catch { return false; }
  })) return true;
  return false;
}

// --- push ---

function validateSkill(source) {
  if (!existsSync(source) || !statSync(source).isDirectory()) die(`skill directory not found: ${source}`);
  const manifest = path.join(source, 'SKILL.md');
  if (!existsSync(manifest)) die(`skill has no SKILL.md: ${source}`);
  if (!/^﻿?---\s*\r?\nname:\s*[^\r\n]+\r?\ndescription:\s*[^\r\n]+\r?\n---/.test(readFileSync(manifest, 'utf8')))
    die('SKILL.md needs name and description frontmatter');
  for (const file of walk(source)) {
    if (lstatSync(file).isSymbolicLink()) die(`symbolic links are not portable: ${file}`);
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    const body = buffer.toString('utf8');
    if (/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|token|password|secret)\s*[:=]\s*["'][^"'\r\n]{8,})/i.test(body))
      die(`possible secret in ${file}`);
    if (/(?:[A-Z]:\\Users\\[^\\\s]+|\/(?:Users|home)\/[^/\s]+)/.test(body))
      die(`machine-specific user path in ${file}; use AGENTS_HOME, HOME, or a relative path`);
  }
}

function push() {
  const input = args[1];
  if (!input || input.startsWith('--')) die('usage: agents.mjs push NAME_OR_PATH [--dry-run] [--commit] [--push]');
  let source = path.resolve(input);
  if (!existsSync(source)) {
    for (const home of ['~/.agents', '~/.codex', '~/.claude', '~/.pi/agent']) {
      const candidate = path.join(expandHome(home), 'skills', input);
      if (existsSync(candidate)) { source = candidate; break; }
    }
  }
  validateSkill(source);
  const name = path.basename(source);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) die(`non-portable skill directory name: ${name}`);
  const destination = path.join(repo, 'home', 'skills', name);
  console.log(`push: ${source} -> ${destination}`);
  if (has('--dry-run')) return;
  if (existsSync(destination)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const backup = path.join(repo, '.bootstrap-backups', `push-${stamp}`, 'home', 'skills', name);
    mkdirSync(path.dirname(backup), { recursive: true });
    renameSync(destination, backup);
    console.log(`backup: ${backup}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, errorOnExist: true });
  run(process.execPath, [verifier], { cwd: repo });
  doctor(true);
  console.log(capture('git', ['status', '--short', '--', `home/skills/${name}`], repo));
  if (has('--push') && !has('--commit')) die('--push requires --commit');
  if (has('--commit')) {
    run('git', ['add', '--', `home/skills/${name}`], { cwd: repo });
    const staged = capture('git', ['diff', '--cached', '--name-only', '--', `home/skills/${name}`], repo);
    if (!staged) console.log('commit: no skill changes');
    else run('git', ['commit', '--only', '-m', `skills: publish ${name}`, '--', `home/skills/${name}`], { cwd: repo });
  }
  if (has('--push')) run('git', ['push'], { cwd: repo });
}

// --- sync ---

function sync() {
  const dryRun = has('--dry-run'), noPull = has('--no-pull');
  if (!existsSync(path.join(repo, '.git'))) die(`not a Git clone: ${repo}`);
  if (!noPull) {
    if (capture('git', ['status', '--porcelain'], repo)) die('bootstrap repository has uncommitted changes; commit, stash, or use --no-pull');
    if (dryRun) run('git', ['fetch', '--dry-run'], { cwd: repo });
    else run('git', ['pull', '--ff-only'], { cwd: repo });
  }
  const installArgs = [installer];
  if (dryRun) installArgs.push('--dry-run');
  if (has('--all')) installArgs.push('--all');
  run(process.execPath, installArgs, { cwd: repo });
  if (!dryRun) run(process.execPath, [verifier], { cwd: repo });
}

// --- targets ---

function targets() {
  const adapters = loadAdapters();
  const pinnedFile = path.join(repo, 'targets.local.json');
  let pinned = null;
  if (existsSync(pinnedFile)) { try { pinned = JSON.parse(readFileSync(pinnedFile, 'utf8')).targets; } catch {} }
  console.log(`repository: ${repo}`);
  console.log(`AGENTS_HOME: ${expandHome(process.env.AGENTS_HOME || '~/.agents')}`);
  console.log(pinned ? `pinned targets: ${pinned.join(', ')}` : 'targets: auto-detect (no targets.local.json)');
  for (const a of adapters) {
    const enabled = pinned ? pinned.includes(a.name) : isDetected(a);
    const home = expandHome((a.home?.env && process.env[a.home.env]) || a.home?.default || `~/.${a.name}`);
    console.log(`  ${enabled ? 'x' : ' '} ${a.name.padEnd(8)} ${a.displayName.padEnd(20)} ${home}  mcp:${a.mcp || 'none'}`);
  }
}

// --- doctor: portability lint over the versioned skills ---

function doctor(quiet = false) {
  const skillsDir = path.join(repo, 'home', 'skills');
  const findings = [];
  if (existsSync(skillsDir)) for (const dir of readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
    const skill = dir.name;
    for (const file of walk(path.join(skillsDir, skill))) {
      const rel = `home/skills/${skill}/${path.relative(path.join(skillsDir, skill), file).replaceAll(path.sep, '/')}`;
      const buffer = readFileSync(file);
      if (buffer.includes(0)) continue;
      const body = buffer.toString('utf8');
      // Hard portability breakers.
      if (/\$\{?CODEX_HOME\b|bootstrap-tools\//.test(body))
        findings.push(['ERROR', rel, 'invokes a Codex-only tool path; use ${AGENTS_HOME:-$HOME/.agents}/tools/']);
      if (/(?:[A-Z]:\\Users\\[^\\\s]+|\/(?:Users|home)\/[^/\s]+)/.test(body))
        findings.push(['ERROR', rel, 'machine-specific user path']);
      // Soft signals worth surfacing.
      if (file.endsWith('SKILL.md') && /\b(local_llm|mcp__|MCP tool)\b/i.test(body))
        findings.push(['WARN', rel, 'depends on an MCP tool; unavailable in harnesses without MCP (e.g. pi)']);
    }
  }
  const errors = findings.filter(f => f[0] === 'ERROR');
  if (!quiet || findings.length) {
    for (const [level, rel, msg] of findings) console.log(`${level}: ${rel}: ${msg}`);
    console.log(`doctor: ${errors.length ? 'FAIL' : 'PASS'} (${errors.length} error(s), ${findings.length - errors.length} warning(s))`);
  }
  if (errors.length) process.exitCode = 1;
  return errors.length === 0;
}

if (command === 'push') push();
else if (command === 'sync') sync();
else if (command === 'targets') targets();
else if (command === 'doctor') doctor();
else if (command === 'install') run(process.execPath, [installer, ...args.slice(1)], { cwd: repo });
else { // status
  console.log(`repository: ${repo}`);
  console.log(capture('git', ['status', '--short', '--branch'], repo));
  run(process.execPath, [verifier], { cwd: repo });
}

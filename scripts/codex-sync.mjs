#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), command = args[0];
const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const has = flag => args.includes(flag);
const run = (program, runArgs, options = {}) => execFileSync(program, runArgs, { encoding: 'utf8', stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', cwd: options.cwd });
const capture = (program, runArgs, cwd) => { try { return run(program, runArgs, { cwd, capture: true }).trim(); } catch { return ''; } };
const die = message => { console.error(`ERROR: ${message}`); process.exit(2); };
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

function repository() {
  if (value('--repo')) return path.resolve(value('--repo'));
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(current, 'home', 'skills')) && existsSync(path.join(current, 'scripts', 'bootstrap.ps1'))) return current;
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  const metadata = path.join(codexHome, 'bootstrap-source.json');
  if (existsSync(metadata)) {
    try { const repo = JSON.parse(readFileSync(metadata, 'utf8').replace(/^\uFEFF/, '')).repository; if (repo && existsSync(repo)) return path.resolve(repo); } catch {}
  }
  die('cannot locate the bootstrap repository; pass --repo PATH or rerun bootstrap from the clone');
}

function validateSkill(source) {
  if (!existsSync(source) || !statSync(source).isDirectory()) die(`skill directory not found: ${source}`);
  const manifest = path.join(source, 'SKILL.md');
  if (!existsSync(manifest)) die(`skill has no SKILL.md: ${source}`);
  const text = readFileSync(manifest, 'utf8');
  if (!/^---\s*\r?\nname:\s*[^\r\n]+\r?\ndescription:\s*[^\r\n]+\r?\n---/.test(text)) die('SKILL.md needs name and description frontmatter');
  for (const file of walk(source)) {
    if (lstatSync(file).isSymbolicLink()) die(`symbolic links are not portable: ${file}`);
    const buffer = readFileSync(file); if (buffer.includes(0)) continue;
    const body = buffer.toString('utf8');
    const secret = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|token|password|secret)\s*[:=]\s*["'][^"'\r\n]{8,})/i;
    const localPath = /(?:[A-Z]:\\Users\\[^\\\s]+|\/(?:Users|home)\/[^/\s]+)/;
    if (secret.test(body)) die(`possible secret in ${file}`);
    if (localPath.test(body)) die(`machine-specific user path in ${file}; replace it with CODEX_HOME, HOME, or a relative path`);
  }
}

function publish(repo) {
  const input = args[1]; if (!input || input.startsWith('--')) die('usage: codex-sync.mjs publish NAME_OR_PATH [--repo PATH] [--dry-run] [--commit] [--push]');
  let source = path.resolve(input);
  if (!existsSync(source)) source = path.join(codexHome, 'skills', input);
  validateSkill(source);
  const name = path.basename(source), destination = path.join(repo, 'home', 'skills', name);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) die(`non-portable skill directory name: ${name}`);
  console.log(`publish: ${source} -> ${destination}`);
  if (has('--dry-run')) return;
  if (existsSync(destination)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const backup = path.join(repo, '.bootstrap-backups', `publish-${stamp}`, 'home', 'skills', name);
    mkdirSync(path.dirname(backup), { recursive: true }); renameSync(destination, backup); console.log(`backup: ${backup}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true }); cpSync(source, destination, { recursive: true, errorOnExist: true });
  run(process.execPath, [path.join(repo, 'scripts', 'verify.mjs')], { cwd: repo });
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

function bootstrap(repo, dryRun) {
  if (process.platform === 'win32') {
    const shell = process.env.ComSpec ? 'powershell' : 'pwsh';
    run(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'scripts', 'bootstrap.ps1'), ...(dryRun ? ['-DryRun'] : [])], { cwd: repo });
  } else run('bash', [path.join(repo, 'scripts', 'bootstrap.sh'), ...(dryRun ? ['--dry-run'] : [])], { cwd: repo });
}

function sync(repo) {
  const dryRun = has('--dry-run'), noPull = has('--no-pull');
  if (!existsSync(path.join(repo, '.git'))) die(`not a Git clone: ${repo}`);
  if (!noPull) {
    const dirty = capture('git', ['status', '--porcelain'], repo);
    if (dirty) die('bootstrap repository has uncommitted changes; commit, stash, or use --no-pull to install the current checkout');
    if (dryRun) run('git', ['fetch', '--dry-run'], { cwd: repo }); else run('git', ['pull', '--ff-only'], { cwd: repo });
  }
  bootstrap(repo, dryRun);
  if (!dryRun) run(process.execPath, [path.join(repo, 'scripts', 'verify.mjs')], { cwd: repo });
}

if (!['publish', 'sync', 'status'].includes(command)) die('usage: codex-sync.mjs publish|sync|status ...');
const repo = repository();
if (command === 'publish') publish(repo);
else if (command === 'sync') sync(repo);
else { console.log(`repository: ${repo}`); console.log(`CODEX_HOME: ${codexHome}`); console.log(capture('git', ['status', '--short', '--branch'], repo)); run(process.execPath, [path.join(repo, 'scripts', 'verify.mjs')], { cwd: repo }); }


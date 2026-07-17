#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const usage = `usage:
  checkpoint.mjs create [--name NAME] [--objective TEXT] [--completed TEXT] [--decision TEXT]
                        [--next TEXT] [--verification TEXT] [--blocker TEXT] [--note TEXT]
                        [--output FILE]
  checkpoint.mjs list [--json]
  checkpoint.mjs show [latest|NAME|FILE] [--json]`;

const command = process.argv[2];
if (!['create', 'list', 'show'].includes(command)) fail(usage);

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
  } catch {
    return '';
  }
};
const root = git('rev-parse', '--show-toplevel');
if (!root) fail('run this command inside a Git repository');
const dir = path.join(root, '.checkpoints');

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  const result = process.argv[index + 1];
  if (!result || result.startsWith('--')) fail(`${name} requires a value`);
  return result.trim();
}

function lines(value) {
  return value ? value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
}

function repositoryStatus() {
  return git('status', '--short', '--branch').split(/\r?\n/).filter(Boolean).filter(line =>
    line.startsWith('##') || !line.slice(3).startsWith('.checkpoints/'),
  );
}

function ensureCheckpointIgnored() {
  const gitPath = git('rev-parse', '--git-path', 'info/exclude');
  if (!gitPath) return;
  const exclude = path.resolve(root, gitPath);
  try {
    const existing = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
    if (existing.split(/\r?\n/).includes('.checkpoints/')) return;
    mkdirSync(path.dirname(exclude), { recursive: true });
    appendFileSync(exclude, `${existing && !existing.endsWith('\n') ? '\n' : ''}.checkpoints/\n`);
  } catch {
    // Checkpoint creation still works when repository metadata is read-only.
  }
}

function checkpointFiles() {
  try {
    return readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .sort()
      .reverse()
      .map(name => path.join(dir, name));
  } catch {
    return [];
  }
}

function readCheckpoint(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read checkpoint ${file}: ${error.message}`);
  }
}

function checkpointEntries() {
  return checkpointFiles()
    .map(file => ({ file, saved: readCheckpoint(file) }))
    .sort((left, right) => String(right.saved.created_at || '').localeCompare(String(left.saved.created_at || '')));
}

function resolveCheckpoint(value = 'latest') {
  const entries = checkpointEntries();
  if (value === 'latest') {
    if (!entries.length) fail(`no checkpoints found in ${dir}`, 1);
    return entries[0].file;
  }
  const direct = path.resolve(value);
  if (existsSync(direct)) return direct;
  const exact = entries.find(entry => path.basename(entry.file, '.json') === value || entry.saved.name === value);
  if (!exact) fail(`checkpoint not found: ${value}`, 1);
  return exact.file;
}

function snapshot() {
  const status = repositoryStatus();
  return {
    repository: root,
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    status,
    changed_files: status.filter(line => !line.startsWith('##')).map(line => line.slice(3)),
    recent_commits: lines(git('log', '-3', '--pretty=format:%h %s')),
  };
}

function drift(saved) {
  const current = snapshot();
  const old = saved.git || saved;
  return {
    repository_changed: Boolean(old.repository && old.repository !== current.repository),
    branch_changed: Boolean(old.branch && old.branch !== current.branch),
    head_changed: Boolean(old.head && old.head !== current.head),
    status_changed: JSON.stringify(old.status || []) !== JSON.stringify(current.status),
    current,
  };
}

function compact(value, fallback = 'not recorded') {
  return String(value || fallback).replace(/\s+/g, ' ').trim();
}

function format(saved, file) {
  const state = drift(saved);
  const context = saved.context || { objective: saved.note, next: saved.note };
  const changed = saved.git?.changed_files || saved.changed_files || [];
  const status = state.repository_changed || state.branch_changed || state.head_changed || state.status_changed ? 'changed since checkpoint' : 'matches checkpoint';
  return [
    `Checkpoint: ${saved.name || path.basename(file, '.json')}`,
    `Created: ${saved.created_at}`,
    `Repository: ${saved.git?.repository || saved.repository || 'unknown'}`,
    `Saved Git: ${saved.git?.branch || saved.branch || '(detached)'} @ ${(saved.git?.head || saved.head || 'unknown').slice(0, 12)}`,
    `Current Git: ${state.current.branch || '(detached)'} @ ${state.current.head.slice(0, 12)} (${status})`,
    `Objective: ${compact(context.objective)}`,
    `Completed (conversation-reported): ${compact(context.completed)}`,
    `Decision: ${compact(context.decision)}`,
    `Verification: ${compact(context.verification)}`,
    `Blocker/risk: ${compact(context.blocker, 'none recorded')}`,
    `Next action: ${compact(context.next)}`,
    `Saved changed files: ${changed.length ? changed.join(', ') : 'none'}`,
    `File: ${file}`,
  ].join('\n');
}

if (command === 'create') {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const requestedName = flag('--name');
  const name = (requestedName || `checkpoint-${stamp}`).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const output = flag('--output') || path.join(dir, `${name}.json`);
  if (!flag('--output')) ensureCheckpointIgnored();
  const note = flag('--note');
  const data = {
    schema_version: 2,
    name,
    created_at: now.toISOString(),
    git: snapshot(),
    context: {
      objective: flag('--objective') || note,
      completed: flag('--completed'),
      decision: flag('--decision'),
      next: flag('--next') || note,
      verification: flag('--verification'),
      blocker: flag('--blocker'),
    },
  };
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, output);
  console.log(output);
  process.exit(0);
}

if (command === 'list') {
  const entries = checkpointEntries().map(({ file, saved }) => ({ file, ...saved }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(entries, null, 2));
  else for (const entry of entries) {
    const context = entry.context || {};
    console.log(`${entry.name || path.basename(entry.file, '.json')}\t${entry.created_at || 'unknown'}\t${compact(context.next || entry.note)}`);
  }
  process.exit(0);
}

const positional = process.argv.slice(3).find(value => !value.startsWith('--')) || 'latest';
const file = resolveCheckpoint(positional);
const saved = readCheckpoint(file);
if (process.argv.includes('--json')) console.log(JSON.stringify({ file, checkpoint: saved, drift: drift(saved) }, null, 2));
else console.log(format(saved, file));

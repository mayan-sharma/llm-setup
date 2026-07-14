#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const dryRun = args.includes('--dry-run');
const repo = path.resolve(value('--repo') || path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const codexHome = path.resolve(value('--codex-home') || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const manifestDir = path.join(repo, 'integrations');
const codex = process.env.CODEX_BIN || 'codex';

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

function run(commandArgs, capture = false) {
  const result = spawnSync(codex, commandArgs, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.error) return { ok: false, error: result.error.message, stdout: result.stdout || '', stderr: result.stderr || '' };
  return { ok: result.status === 0, error: result.stderr || '', stdout: result.stdout || '', stderr: result.stderr || '' };
}

function loadManifest(file) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { die(`invalid MCP manifest ${file}: ${error.message}`); }
  if (!/^[a-zA-Z0-9_-]+$/.test(manifest.name || '')) die(`invalid MCP name in ${file}`);
  if (!manifest.command || typeof manifest.command !== 'object') die(`missing platform command in ${file}`);
  if (!Array.isArray(manifest.args) || !manifest.args.every(arg => typeof arg === 'string')) die(`args must be a string array in ${file}`);
  if (manifest.env && (typeof manifest.env !== 'object' || Array.isArray(manifest.env) || Object.values(manifest.env).some(value => typeof value !== 'string'))) die(`env must map names to strings in ${file}`);
  const command = manifest.command[process.platform];
  if (!command || typeof command !== 'string') die(`no ${process.platform} command in ${file}`);
  const expand = text => text.replaceAll('{CODEX_HOME}', codexHome);
  return { name: manifest.name, command: expand(command), args: manifest.args.map(expand), env: Object.fromEntries(Object.entries(manifest.env || {}).map(([key, val]) => [key, expand(val)])) };
}

function equivalent(current, desired) {
  const transport = current.transport;
  if (!transport || transport.type !== 'stdio' || transport.command !== desired.command) return false;
  if (JSON.stringify(transport.args || []) !== JSON.stringify(desired.args)) return false;
  return JSON.stringify(transport.env || {}) === JSON.stringify(desired.env);
}

function reconcile(desired) {
  const currentResult = run(['mcp', 'get', desired.name, '--json'], true);
  let current;
  if (currentResult.ok) {
    try { current = JSON.parse(currentResult.stdout); } catch { die(`Codex returned invalid MCP configuration for ${desired.name}`); }
    if (equivalent(current, desired)) { console.log(`ok       mcp:${desired.name}`); return; }
  }

  const action = current ? 'update' : 'install';
  console.log(`${action.padEnd(8)} mcp:${desired.name}`);
  if (dryRun) return;
  if (current) {
    const removed = run(['mcp', 'remove', desired.name]);
    if (!removed.ok) die(`could not remove managed MCP ${desired.name}: ${removed.error.trim()}`);
  }
  const envArgs = Object.entries(desired.env).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const added = run(['mcp', 'add', desired.name, ...envArgs, '--', desired.command, ...desired.args]);
  if (!added.ok) die(`could not configure managed MCP ${desired.name}: ${added.error.trim()}`);
}

if (!existsSync(manifestDir)) { console.log('No MCP integration manifests.'); process.exit(0); }
const manifests = readdirSync(manifestDir).filter(name => name.endsWith('.mcp.json')).sort();
for (const name of manifests) reconcile(loadManifest(path.join(manifestDir, name)));

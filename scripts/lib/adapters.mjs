// Shared helpers for the multi-harness installer and the unified `agents` CLI.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Repo root is two levels up from scripts/lib/ (scripts/lib -> scripts -> repo).
export const REPO_ROOT = path.dirname(path.dirname(HERE));
export const PAYLOAD = path.join(REPO_ROOT, 'home');
export const ADAPTERS_DIR = path.join(REPO_ROOT, 'adapters');

// Helper tools that install into the shared ~/.agents/tools directory so every
// harness references them the same way.
export const SHARED_TOOLS = ['checkpoint.mjs', 'local-llm.mjs', 'agents.mjs', 'codex-sync.mjs'];

// Expand a leading ~ and normalize to an absolute path.
export function expandHome(input) {
  if (!input) return input;
  let value = input.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.resolve(value);
}

// The shared cross-agent standard location (skills + tools live here).
export function agentsHome() {
  return expandHome(process.env.AGENTS_HOME || '~/.agents');
}

export function sharedSkillsDir() {
  return path.join(agentsHome(), 'skills');
}

export function sharedToolsDir() {
  return path.join(agentsHome(), 'tools');
}

// Load adapters from a specific repo checkout (the installed CLI locates the repo
// at runtime rather than assuming it lives inside it).
export function loadAdaptersFrom(repoRoot) {
  const dir = path.join(repoRoot, 'adapters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const file = path.join(dir, name);
      let data;
      try {
        data = JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        throw new Error(`invalid adapter ${name}: ${error.message}`);
      }
      if (data.name !== path.basename(name, '.json')) {
        throw new Error(`adapter ${name} has mismatched name "${data.name}"`);
      }
      return data;
    });
}

export function loadAdapters() {
  return loadAdaptersFrom(REPO_ROOT);
}

// Resolve the config home directory for one adapter, honoring its env override.
export function adapterHome(adapter) {
  const override = adapter.home?.env && process.env[adapter.home.env];
  return expandHome(override || adapter.home?.default || `~/.${adapter.name}`);
}

function binOnPath(bin) {
  const probe = process.platform === 'win32' ? ['where', bin] : ['command', '-v', bin];
  try {
    execFileSync(probe[0], probe.slice(1), { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    // `command` is a shell builtin; fall back to a shell probe on POSIX.
    if (process.platform !== 'win32') {
      try {
        execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: ['ignore', 'ignore', 'ignore'] });
        return true;
      } catch {}
    }
    return false;
  }
}

// True when the harness this adapter targets appears to be present on the machine.
export function isDetected(adapter) {
  const detect = adapter.detect || {};
  if ((detect.env || []).some(name => process.env[name])) return true;
  if ((detect.paths || []).some(p => existsSync(expandHome(p)))) return true;
  if ((detect.bin || []).some(binOnPath)) return true;
  return false;
}

// Read an optional git-ignored targets.local.json to pin an explicit set.
export function pinnedTargets() {
  const file = path.join(REPO_ROOT, 'targets.local.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(parsed.targets)) return parsed.targets;
  } catch (error) {
    throw new Error(`invalid targets.local.json: ${error.message}`);
  }
  return null;
}

// Decide which adapters to install into: an explicit pin wins, otherwise
// auto-detected harnesses.
export function selectTargets(adapters, { all = false } = {}) {
  if (all) return adapters;
  const pinned = pinnedTargets();
  if (pinned) return adapters.filter(a => pinned.includes(a.name));
  return adapters.filter(isDetected);
}

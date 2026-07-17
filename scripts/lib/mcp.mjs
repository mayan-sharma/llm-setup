// Declarative MCP reconciliation across harnesses. Each integrations/*.mcp.json
// manifest is registered into every adapter whose `mcp` method supports it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, adapterHome, agentsHome, sharedToolsDir } from './adapters.mjs';

const MANIFEST_DIR = path.join(REPO_ROOT, 'integrations');

// Tokens a manifest may use so it stays machine- and harness-neutral.
function tokens() {
  return {
    '{AGENTS_TOOLS}': sharedToolsDir(),
    '{AGENTS_HOME}': agentsHome(),
  };
}

function expand(text, home) {
  let out = String(text).replaceAll('{CODEX_HOME}', home);
  for (const [token, value] of Object.entries(tokens())) out = out.replaceAll(token, value);
  return out;
}

export function loadManifests() {
  if (!existsSync(MANIFEST_DIR)) return [];
  return readdirSync(MANIFEST_DIR)
    .filter(name => name.endsWith('.mcp.json'))
    .sort()
    .map(name => {
      const file = path.join(MANIFEST_DIR, name);
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      if (!/^[a-zA-Z0-9_-]+$/.test(manifest.name || '')) throw new Error(`invalid MCP name in ${name}`);
      if (!manifest.command || typeof manifest.command !== 'object') throw new Error(`missing platform command in ${name}`);
      if (!Array.isArray(manifest.args) || !manifest.args.every(a => typeof a === 'string')) throw new Error(`args must be strings in ${name}`);
      return manifest;
    });
}

// Resolve a manifest to concrete command/args/env for a given adapter home.
function resolve(manifest, home) {
  const command = manifest.command[process.platform];
  if (!command || typeof command !== 'string') return null; // no command for this platform
  return {
    name: manifest.name,
    command: expand(command, home),
    args: manifest.args.map(a => expand(a, home)),
    env: Object.fromEntries(Object.entries(manifest.env || {}).map(([k, v]) => [k, expand(v, home)])),
  };
}

function cli(bin, cliArgs, capture = false) {
  // Let each harness CLI resolve its own config location the way the user's real
  // sessions do (honoring any env override they already set in process.env).
  // Forcing e.g. CLAUDE_CONFIG_DIR here would write MCP config to a path Claude
  // does not read by default.
  const env = { ...process.env };
  // On Windows the harness CLIs are usually .cmd/.ps1 shims that CreateProcess
  // cannot resolve directly, so run through a shell and quote arguments.
  const win = process.platform === 'win32';
  const quote = s => (win && /[\s"&|<>^()]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);
  const result = spawnSync(win ? quote(bin) : bin, cliArgs.map(quote), {
    encoding: 'utf8',
    env,
    shell: win,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  // result.error means the binary could not be spawned (e.g. ENOENT: CLI not on PATH).
  if (result.error) return { ok: false, missing: true, err: result.error.message, stdout: '', stderr: '' };
  return { ok: result.status === 0, missing: false, err: result.stderr || '', stdout: result.stdout || '', stderr: result.stderr || '' };
}

function codexEquivalent(current, desired) {
  const t = current?.transport;
  if (!t || t.type !== 'stdio' || t.command !== desired.command) return false;
  if (JSON.stringify(t.args || []) !== JSON.stringify(desired.args)) return false;
  return JSON.stringify(t.env || {}) === JSON.stringify(desired.env);
}

// Reconcile all manifests into one adapter. Returns a list of log lines.
export function reconcileAdapter(adapter, { dryRun = false } = {}) {
  const method = adapter.mcp || 'none';
  const logs = [];
  if (method === 'none') return logs;

  const home = adapterHome(adapter);
  const bin = process.env[`${adapter.name.toUpperCase()}_BIN`] || adapter.name;

  const manifests = loadManifests();
  if (manifests.length) {
    // Probe the CLI once; if it is not installed, skip MCP for this harness rather
    // than failing the whole install (the harness may not be present on this machine).
    const probe = cli(bin, ['mcp', '--help'], true);
    if (probe.missing) { logs.push(`skip     mcp (${adapter.name}: ${bin} CLI not found on PATH)`); return logs; }
  }

  for (const manifest of manifests) {
    const desired = resolve(manifest, home);
    if (!desired) { logs.push(`skip     mcp:${manifest.name} (${adapter.name}: no ${process.platform} command)`); continue; }

    if (method === 'codex-cli') {
      const got = cli(bin, ['mcp', 'get', desired.name, '--json'], true);
      let current;
      if (got.ok) { try { current = JSON.parse(got.stdout); } catch {} }
      if (current && codexEquivalent(current, desired)) { logs.push(`ok       mcp:${desired.name} (${adapter.name})`); continue; }
      logs.push(`${current ? 'update' : 'install'}   mcp:${desired.name} (${adapter.name})`);
      if (dryRun) continue;
      if (current) {
        const removed = cli(bin, ['mcp', 'remove', desired.name]);
        if (!removed.ok) throw new Error(`could not remove MCP ${desired.name} from ${adapter.name}: ${removed.err.trim()}`);
      }
      const envArgs = Object.entries(desired.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
      const added = cli(bin, ['mcp', 'add', desired.name, ...envArgs, '--', desired.command, ...desired.args]);
      if (!added.ok) throw new Error(`could not add MCP ${desired.name} to ${adapter.name}: ${added.err.trim()}`);
    } else if (method === 'claude-cli') {
      // Claude's `mcp get` JSON shape is less stable; reconcile on presence.
      const got = cli(bin, ['mcp', 'get', desired.name], true);
      if (got.ok) { logs.push(`ok       mcp:${desired.name} (${adapter.name})`); continue; }
      logs.push(`install   mcp:${desired.name} (${adapter.name})`);
      if (dryRun) continue;
      const envArgs = Object.entries(desired.env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
      const added = cli(bin, ['mcp', 'add', desired.name, '--scope', 'user', ...envArgs, '--', desired.command, ...desired.args]);
      if (!added.ok) throw new Error(`could not add MCP ${desired.name} to ${adapter.name}: ${added.err.trim()}`);
    } else {
      logs.push(`skip     mcp:${desired.name} (${adapter.name}: unknown method "${method}")`);
    }
  }
  return logs;
}

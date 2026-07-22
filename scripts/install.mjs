#!/usr/bin/env node
// Cross-platform, multi-harness installer. Maps the single home/ payload into the
// shared ~/.agents standard location plus every enabled harness adapter.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PAYLOAD, REPO_ROOT, SHARED_TOOLS, adapterHome, agentsHome, loadAdapters,
  selectTargets, sharedSkillsDir, sharedToolsDir,
} from './lib/adapters.mjs';
import { reconcileAdapter } from './lib/mcp.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const SCRIPTS = path.join(REPO_ROOT, 'scripts');

let changed = 0;
let backedUp = 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const backupRoot = path.join(REPO_ROOT, '.bootstrap-backups', stamp);

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');

// A managed TOML config is shared: this repository owns the bare top-level keys the
// payload declares, while the destination machine owns everything else — `notify`
// hooks, `[mcp_servers.*]` written by the harness's own MCP CLI, `[projects.*]` trust
// levels, `[desktop]`, `[marketplaces.*]`. Overwriting the file wholesale would revert
// all of that on every sync, so merge instead: replace the values we own in place and
// preserve every other line verbatim.
//
// Deliberately line-based rather than a real TOML parse — the repository is Node-only
// with no dependencies, and the payload is a flat list of scalar defaults. Keys inside
// the destination's own `[sections]` are left alone; only the leading bare-key region
// is managed.
function mergeManagedToml(payloadText, destinationText) {
  const owned = new Map();
  for (const line of payloadText.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;            // payload's own sections are not merged
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    if (match) owned.set(match[1], line);
  }

  const out = [];
  const seen = new Set();
  let inLeadingRegion = true;
  for (const line of destinationText.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) inLeadingRegion = false;
    if (inLeadingRegion) {
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      if (match && owned.has(match[1])) {
        out.push(owned.get(match[1]));          // adopt the payload's value
        seen.add(match[1]);
        continue;
      }
    }
    out.push(line);
  }

  // Keys the payload introduced that the destination lacks: insert after the leading
  // comment block, before any section, so they stay in the managed region.
  const missing = [...owned.entries()].filter(([key]) => !seen.has(key)).map(([, line]) => line);
  if (missing.length) {
    let at = 0;
    while (at < out.length && (/^\s*#/.test(out[at]) || out[at].trim() === '')) at++;
    out.splice(at, 0, ...missing);
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

// Install one file, backing up any differing destination first. `label` is the
// tag printed; `content:true` writes generated text instead of copying a file;
// `managedToml:true` merges the payload's owned top-level keys into an existing
// destination instead of replacing it, so the installer and the harness's own tooling
// stop fighting over the same file.
function installFile(sourcePathOrContent, destination, label, { content = false, managedToml = false } = {}) {
  const relative = label;
  let merged;
  if (existsSync(destination)) {
    let same;
    if (content) same = readFileSync(destination, 'utf8') === sourcePathOrContent;
    else if (managedToml) {
      const dst = readFileSync(destination, 'utf8');
      merged = mergeManagedToml(readFileSync(sourcePathOrContent, 'utf8'), dst);
      same = merged === dst;
    } else same = hash(sourcePathOrContent) === hash(destination);
    if (same) { console.log(`ok       ${relative}`); return; }
    const backup = path.join(backupRoot, relative.replace(/[:\\/]+/g, '_'));
    console.log(`backup   ${relative}`);
    if (!dryRun) { mkdirSync(path.dirname(backup), { recursive: true }); cpSync(destination, backup); }
    backedUp++;
  }
  console.log(`${merged ? 'merge  ' : 'install'}  ${relative}`);
  if (!dryRun) {
    mkdirSync(path.dirname(destination), { recursive: true });
    if (merged !== undefined) writeFileSync(destination, merged, { encoding: 'utf8' });
    else if (content) writeFileSync(destination, sourcePathOrContent, { encoding: 'utf8' });
    else cpSync(sourcePathOrContent, destination);
  }
  changed++;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

// --- Shared standard location: skills + helper tools + optional MCP server ---

function installSharedSkills() {
  const skillsSrc = path.join(PAYLOAD, 'skills');
  if (!existsSync(skillsSrc)) return;
  const dest = sharedSkillsDir();
  for (const file of walk(skillsSrc)) {
    const rel = path.relative(skillsSrc, file);
    installFile(file, path.join(dest, rel), `~/.agents/skills/${rel.replaceAll(path.sep, '/')}`);
  }
}

function installSharedTools() {
  const tools = sharedToolsDir();
  for (const tool of SHARED_TOOLS) {
    const src = path.join(SCRIPTS, tool);
    if (existsSync(src)) installFile(src, path.join(tools, tool), `~/.agents/tools/${tool}`);
  }
  // lib/ is required by agents.mjs at runtime.
  const libSrc = path.join(SCRIPTS, 'lib');
  if (existsSync(libSrc)) for (const file of walk(libSrc)) {
    const rel = path.relative(libSrc, file);
    installFile(file, path.join(tools, 'lib', rel), `~/.agents/tools/lib/${rel.replaceAll(path.sep, '/')}`);
  }
  // Optional local-LLM MCP server travels with the tools so any harness can register it.
  const serverSrc = path.join(PAYLOAD, 'local-llm', 'server.py');
  if (existsSync(serverSrc)) installFile(serverSrc, path.join(tools, 'local-llm', 'server.py'), '~/.agents/tools/local-llm/server.py');
}

// --- Per-adapter install ---

function installInstructions(adapter, home) {
  const spec = adapter.instructions;
  if (!spec) return;
  const canonical = path.join(PAYLOAD, 'AGENTS.md');
  if (!existsSync(canonical)) return;
  const dest = path.join(home, spec.file);
  if (spec.mode === 'import-agents') {
    // Generate a file that pulls in the canonical AGENTS.md (Claude reads @-imports).
    const body = readFileSync(canonical, 'utf8');
    const generated =
      `<!-- Generated by llm-setup install.mjs from home/AGENTS.md. Edit the source, not this file. -->\n\n${body}`;
    installFile(generated, dest, `${adapter.name}:${spec.file}`, { content: true });
  } else {
    installFile(canonical, dest, `${adapter.name}:${spec.file}`);
  }
}

function installExtraFiles(adapter, home) {
  for (const rel of adapter.extraFiles || []) {
    const src = path.join(PAYLOAD, rel);
    const managedToml = rel === adapter.mcpConfigFile;
    if (existsSync(src)) installFile(src, path.join(home, rel), `${adapter.name}:${rel}`, { managedToml });
    else console.log(`skip     ${adapter.name}:${rel} (missing in payload)`);
  }
}

function installPrivateSkills(adapter, home) {
  if (adapter.skills !== 'private') return; // shared adapters rely on ~/.agents/skills
  const skillsSrc = path.join(PAYLOAD, 'skills');
  if (!existsSync(skillsSrc)) return;
  const dest = path.join(home, 'skills');
  for (const file of walk(skillsSrc)) {
    const rel = path.relative(skillsSrc, file);
    installFile(file, path.join(dest, rel), `${adapter.name}:skills/${rel.replaceAll(path.sep, '/')}`);
  }
}

function writeMetadata(home) {
  if (dryRun) return;
  const file = path.join(home, 'bootstrap-source.json');
  const data = { repository: REPO_ROOT, installed_at: new Date().toISOString(), version: 2 };
  mkdirSync(home, { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// --- Orchestration ---

const adapters = loadAdapters();
const targets = selectTargets(adapters, { all });

console.log(`AGENTS_HOME: ${agentsHome()}`);
if (!targets.length) {
  console.log('No harnesses selected (none detected and no targets.local.json).');
  console.log('Pass --all to install for every adapter, or create targets.local.json.');
}

console.log('--- shared standard location ---');
installSharedSkills();
installSharedTools();

const restartNotes = [];
for (const adapter of targets) {
  const home = adapterHome(adapter);
  console.log(`--- ${adapter.displayName} (${home}) ---`);
  installInstructions(adapter, home);
  installExtraFiles(adapter, home);
  installPrivateSkills(adapter, home);
  try {
    for (const line of reconcileAdapter(adapter, { dryRun })) console.log(line);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
  writeMetadata(home);
  if (adapter.restartNote) restartNotes.push(`${adapter.displayName}: ${adapter.restartNote}`);
}

console.log(`Done: ${changed} installed, ${backedUp} backed up${dryRun ? ' (dry run)' : ''}.`);
for (const note of restartNotes) console.log(note);

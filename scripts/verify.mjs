#!/usr/bin/env node
// Multi-harness verification: validates repo structure, skill frontmatter, adapter
// definitions, MCP manifests, portability, and installed drift across the shared
// standard location and every selected harness home.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  PAYLOAD, REPO_ROOT, SHARED_TOOLS, adapterHome, loadAdapters, selectTargets,
  sharedSkillsDir, sharedToolsDir,
} from './lib/adapters.mjs';
import { loadManifests } from './lib/mcp.mjs';

const errors = [];
const warnings = [];
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const rel = p => path.relative(REPO_ROOT, p);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');

// --- Required repo files ---
for (const name of ['AGENTS.md', 'README.md', 'home/AGENTS.md', 'home/config.toml']) {
  if (!existsSync(path.join(REPO_ROOT, name))) errors.push(`missing required file: ${name}`);
}

// --- Skills: frontmatter + portability ---
const skillsDir = path.join(PAYLOAD, 'skills');
const skillFiles = existsSync(skillsDir) ? walk(skillsDir) : [];
const skills = skillFiles.filter(f => f.endsWith(`${path.sep}SKILL.md`));
for (const skill of skills) {
  if (!/^﻿?---\s*\r?\nname:\s*[^\r\n]+\r?\ndescription:\s*[^\r\n]+\r?\n---/.test(readFileSync(skill, 'utf8')))
    errors.push(`invalid skill frontmatter: ${rel(skill)}`);
}
for (const file of skillFiles) {
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const body = buffer.toString('utf8');
  if (/\$\{?CODEX_HOME\b|bootstrap-tools\//.test(body))
    errors.push(`Codex-only tool path in skill (breaks portability): ${rel(file)}`);
}

// --- Adapters ---
let adapters = [];
try {
  adapters = loadAdapters();
} catch (error) {
  errors.push(`adapter error: ${error.message}`);
}
const KNOWN_MCP = new Set(['codex-cli', 'claude-cli', 'none']);
for (const adapter of adapters) {
  if (!adapter.home?.default) errors.push(`adapter ${adapter.name}: missing home.default`);
  if (!KNOWN_MCP.has(adapter.mcp || 'none')) errors.push(`adapter ${adapter.name}: unknown mcp method "${adapter.mcp}"`);
  if (adapter.skills && !['shared', 'private'].includes(adapter.skills)) errors.push(`adapter ${adapter.name}: skills must be shared|private`);
  if (adapter.instructions && !['copy', 'import-agents'].includes(adapter.instructions.mode))
    errors.push(`adapter ${adapter.name}: instructions.mode must be copy|import-agents`);
}

// --- MCP manifests ---
let manifests = [];
try {
  manifests = loadManifests();
} catch (error) {
  errors.push(`MCP manifest error: ${error.message}`);
}
for (const manifest of manifests) {
  for (const value of [...Object.values(manifest.command || {}), ...(manifest.args || []), ...Object.values(manifest.env || {})]) {
    if (/(?:[A-Z]:\\Users\\|\/(?:Users|home)\/)/.test(value)) errors.push(`machine-specific path in MCP ${manifest.name}`);
  }
}

// --- Credentials in payload ---
const forbidden = /(auth\.json|api[_-]?key\s*=|bearer\s+[a-z0-9])/i;
for (const file of existsSync(PAYLOAD) ? walk(PAYLOAD) : []) {
  if (forbidden.test(readFileSync(file, 'utf8'))) errors.push(`possible credential or forbidden state: ${rel(file)}`);
}

// --- Installed drift (best effort) ---
const sharedSkills = sharedSkillsDir();
if (existsSync(sharedSkills)) {
  for (const file of skillFiles) {
    const dest = path.join(sharedSkills, path.relative(skillsDir, file));
    if (!existsSync(dest)) warnings.push(`shared skill not installed: ${dest}`);
    else if (hash(file) !== hash(dest)) warnings.push(`shared skill drift: ${dest}`);
  }
} else {
  warnings.push(`shared skills not installed yet: ${sharedSkills}`);
}
const sharedTools = sharedToolsDir();
for (const tool of SHARED_TOOLS) {
  const src = path.join(REPO_ROOT, 'scripts', tool);
  const dest = path.join(sharedTools, tool);
  if (existsSync(src) && existsSync(dest) && hash(src) !== hash(dest)) warnings.push(`tool drift: ${dest}`);
  else if (existsSync(src) && !existsSync(dest)) warnings.push(`tool not installed: ${dest}`);
}

const targets = selectTargets(adapters);
if (!targets.length) warnings.push('no harnesses detected and no targets.local.json; nothing installed on this machine');
for (const adapter of targets) {
  const home = adapterHome(adapter);
  if (!existsSync(home)) { warnings.push(`${adapter.name} home missing: ${home}`); continue; }
  if (adapter.instructions && !existsSync(path.join(home, adapter.instructions.file)))
    warnings.push(`${adapter.name} instructions not installed: ${path.join(home, adapter.instructions.file)}`);
  for (const extra of adapter.extraFiles || []) {
    if (!existsSync(path.join(home, extra))) warnings.push(`${adapter.name} file not installed: ${path.join(home, extra)}`);
  }
  if (adapter.skills === 'private' && !existsSync(path.join(home, 'skills'))) warnings.push(`${adapter.name} private skills not installed: ${path.join(home, 'skills')}`);
}

warnings.forEach(w => console.log(`WARN: ${w}`));
errors.forEach(e => console.log(`ERROR: ${e}`));
console.log(`Checked ${skills.length} skills, ${adapters.length} adapters, ${manifests.length} MCP manifest(s): ${errors.length ? 'FAIL' : 'PASS'}`);
process.exitCode = errors.length ? 1 : 0;

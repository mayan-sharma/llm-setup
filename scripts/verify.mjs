#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), payload = path.join(root, 'home');
const errors = [], warnings = [];
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
for (const name of ['AGENTS.md', 'README.md', 'home/AGENTS.md', 'home/config.toml']) if (!existsSync(path.join(root, name))) errors.push(`missing required file: ${name}`);
const files = walk(payload), skills = files.filter(x => x.endsWith(`${path.sep}SKILL.md`)), configs = files.filter(x => x.endsWith('.toml'));
for (const skill of skills) if (!/^\uFEFF?---\s*\r?\nname:\s*[^\r\n]+\r?\ndescription:\s*[^\r\n]+\r?\n---/.test(readFileSync(skill, 'utf8'))) errors.push(`invalid skill frontmatter: ${path.relative(root, skill)}`);
const forbidden = /(auth\.json|api[_-]?key\s*=|bearer\s+[a-z0-9])/i;
for (const file of files) if (forbidden.test(readFileSync(file, 'utf8'))) errors.push(`possible credential or forbidden state reference: ${path.relative(root, file)}`);
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
if (existsSync(codexHome)) for (const source of files) { const destination = path.join(codexHome, path.relative(payload, source)); if (!existsSync(destination)) warnings.push(`not installed: ${destination}`); else if (hash(source) !== hash(destination)) warnings.push(`installed drift: ${destination}`); }
else warnings.push(`CODEX_HOME does not exist yet: ${codexHome}`);
warnings.forEach(x => console.log(`WARN: ${x}`)); errors.forEach(x => console.log(`ERROR: ${x}`));
console.log(`Checked ${configs.length} config files and ${skills.length} skills: ${errors.length ? 'FAIL' : 'PASS'}`);
process.exitCode = errors.length ? 1 : 0;

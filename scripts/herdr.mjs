#!/usr/bin/env node
// Bring Herdr app work back into the repository so another machine can sync it.
// Layouts and mods are edited live in the app's own folder; `capture` copies them
// into home/herdr-app/, the payload the installer puts back on every machine.
//
//   node scripts/herdr.mjs capture             files already in the payload that changed
//   node scripts/herdr.mjs capture <name>...   also add layout, theme and mod <name>
//   --dry-run                                  list, change nothing
//
// Never capture employer-owned or machine-specific mods: the payload is published.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { HERDR_PAYLOAD, herdrAppFiles, herdrAppHome } from './lib/herdr.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const names = args.slice(1).filter(arg => !arg.startsWith('--'));
if (args[0] !== 'capture') { console.error('usage: herdr.mjs capture [name...] [--dry-run]'); process.exit(2); }

const appHome = herdrAppHome();
if (!appHome) { console.error('ERROR: the Herdr app folder was not found on this machine'); process.exit(2); }

// Written by the app into every mod folder; not ours to version.
const GENERATED = new Set(['gpui-kit.d.ts', 'jsconfig.json']);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

const wanted = new Set(herdrAppFiles().map(({ rel }) => rel));
for (const name of names) {
  for (const rel of [`layouts/${name}.json`, `layouts/${name}.svg`, `layouts/${name}.png`, `themes/${name}.json`])
    if (existsSync(path.join(appHome, rel))) wanted.add(path.normalize(rel));
  const mod = path.join(appHome, 'mods', name);
  if (existsSync(mod)) for (const file of walk(mod))
    if (!GENERATED.has(path.basename(file)) && !path.basename(file).startsWith('.')) wanted.add(path.relative(appHome, file));
}

let changed = 0;
for (const rel of [...wanted].sort()) {
  const source = path.join(appHome, rel);
  const destination = path.join(HERDR_PAYLOAD, rel);
  if (!existsSync(source)) { console.log(`missing  ${rel} (in the payload, not in the app folder)`); continue; }
  if (existsSync(destination) && hash(source) === hash(destination)) continue;
  console.log(`capture  ${rel}`);
  if (!dryRun) { mkdirSync(path.dirname(destination), { recursive: true }); cpSync(source, destination); }
  changed++;
}
console.log(`Done: ${changed} captured${dryRun ? ' (dry run)' : ''}. Review with git diff, then commit.`);

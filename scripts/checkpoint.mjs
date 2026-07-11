#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const git = (...args) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const command = process.argv[2];
if (!['create', 'list'].includes(command)) { console.error('usage: checkpoint.mjs create [--note TEXT] [--output FILE] | list'); process.exit(2); }
const root = git('rev-parse', '--show-toplevel');
if (!root) { console.error('run this command inside a Git repository'); process.exit(2); }
const dir = path.join(root, '.checkpoints');
if (command === 'list') {
  try { readdirSync(dir).filter(x => x.endsWith('.json')).sort().reverse().forEach(x => console.log(path.join(dir, x))); } catch {}
  process.exit(0);
}
const value = flag => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] ?? '' : ''; };
const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const output = value('--output') || path.join(dir, `checkpoint-${stamp}.json`);
const lines = value => value ? value.split(/\r?\n/) : [];
const data = { created_at: now.toISOString(), repository: root, branch: git('branch', '--show-current'), head: git('rev-parse', 'HEAD'), note: value('--note'), status: lines(git('status', '--short', '--branch')), changed_files: lines(git('diff', '--name-only', 'HEAD')), recent_commits: lines(git('log', '-5', '--pretty=format:%h %s')) };
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
console.log(output);


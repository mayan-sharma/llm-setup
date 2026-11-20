#!/usr/bin/env node
// Resume Claude Code sessions in Herdr desktop app terminals after a reboot.
//
// herdr-core brings a kept terminal back as a plain shell after a reboot, logout
// or lost holder, and never reruns its program. This remembers which Claude
// session each terminal was running (as labels on the terminal, so the record
// lives and dies with it) and hands the new shell the session to resume.
//
//   record   Claude Code SessionStart hook (hook JSON on stdin)
//   end      Claude Code SessionEnd hook (hook JSON on stdin)
//   pending  <shell pid>: print the session id the calling shell should resume,
//            once, or nothing. Called from the block in the shell's rc file.
//
// Labels on the terminal:
//   claude.session  the session id
//   claude.shell    "<pid>@<boot>" of the terminal's own process when recorded;
//                   a different value later means the terminal was recovered.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The person closed the conversation on purpose: nothing to bring back.
const DELIBERATE = new Set(['prompt_input_exit', 'logout']);

const run = (bin, args) =>
  execFileSync(bin, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
const hc = (...args) => run('hc', args);

function terminal() {
  const id = process.env.HC_TERMINAL_ID;
  if (!id) return {};
  return { id, info: JSON.parse(hc('get', id, '--json')) };
}

// When this machine booted: pids repeat across boots.
function boot() {
  try {
    if (process.platform === 'darwin') {
      const match = run('sysctl', ['-n', 'kern.boottime']).match(/sec = (\d+)/);
      if (match) return match[1];
    } else if (process.platform === 'linux') {
      const match = readFileSync('/proc/stat', 'utf8').match(/^btime (\d+)/m);
      if (match) return match[1];
    }
  } catch { /* fall through */ }
  return String(Math.round((Date.now() / 1000 - os.uptime()) / 60));
}

const stamp = pid => `${pid}@${boot()}`;

// True when this Claude was started by another Claude (a `claude -p` in a tool
// call): that session is not the one the terminal shows. Unix only.
function nested() {
  if (process.platform === 'win32') return false;
  let rows;
  try { rows = run('ps', ['-axo', 'pid=,ppid=,comm=']); } catch { return false; }
  const table = new Map();
  for (const line of rows.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (match) table.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
  }
  const chain = [];
  for (let pid = process.ppid; table.has(pid) && pid > 1 && chain.length < 64; pid = table.get(pid).parent)
    chain.push({ pid, command: table.get(pid).command });
  if (!chain.length) return false;
  const owner = Math.max(0, chain.findIndex(p => String(p.pid) === process.env.CLAUDE_PID));
  return chain.slice(owner + 1).some(p => p.command === chain[owner].command);
}

function hookInput() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

function record() {
  const data = hookInput();
  const session = data.session_id;
  if (data.agent_id || typeof session !== 'string' || !UUID.test(session)) return;
  const { id, info } = terminal();
  if (!id || nested()) return;
  hc('label', id, `claude.session=${session}`, `claude.shell=${stamp(info.pid)}`);
}

function end() {
  const data = hookInput();
  if (data.agent_id || !DELIBERATE.has(data.reason)) return;
  const { id, info } = terminal();
  if (!id || nested()) return;
  // Only our own record: a newer session may already have replaced it.
  if (info.labels?.['claude.session'] === data.session_id) hc('label', id, 'claude.session=', 'claude.shell=');
}

function pending(shellPid) {
  const { id, info } = terminal();
  if (!id) return;
  const session = info.labels?.['claude.session'] ?? '';
  if (!UUID.test(session)) return;
  // Only the terminal's own shell, and only a different one than recorded.
  if (String(info.pid) !== String(shellPid)) return;
  const now = stamp(shellPid);
  if (info.labels?.['claude.shell'] === now) return;
  // Once: mark this shell as seen before handing the session over, so a resume
  // that fails cannot repeat.
  hc('label', id, `claude.shell=${now}`);
  console.log(session);
}

try {
  const [action, arg] = process.argv.slice(2);
  if (action === 'record') record();
  else if (action === 'end') end();
  else if (action === 'pending' && arg) pending(arg);
} catch {
  // Never get in the way of a session or a shell starting.
}

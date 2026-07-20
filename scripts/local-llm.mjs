#!/usr/bin/env node
// Local-LLM endpoint helper for the LM Studio server that backs the local-llm MCP.
//   doctor  probe the endpoint and name the recovery command
//   start   bring the endpoint up on demand
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = (process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');

async function probe(timeoutMs = 2000) {
  try {
    const response = await fetch(`${BASE_URL}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return { ok: true, models: (body.data || []).map(item => item.id || '?') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// LM Studio installs its CLI under ~/.lmstudio/bin; fall back to PATH.
function lmsBinary() {
  const bundled = path.join(os.homedir(), '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms');
  if (existsSync(bundled)) return bundled;
  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['lms'], { encoding: 'utf8' });
  return lookup.stdout?.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null;
}

async function doctor() {
  const status = await probe();
  if (status.ok) {
    console.log(`lmstudio: ready at ${BASE_URL} (${status.models.join(', ') || 'no models downloaded'})`);
    return status.models.length ? 0 : 1;
  }
  console.log(`lmstudio: unavailable at ${BASE_URL} (${status.error})`);
  console.log(`\nRecovery: node "${process.argv[1]}" start`);
  return 1;
}

async function start() {
  const running = await probe();
  if (running.ok) {
    console.log(`lmstudio: already running (${running.models.join(', ') || 'no models downloaded'})`);
    return running.models.length ? 0 : 1;
  }
  const lms = lmsBinary();
  if (!lms) {
    console.log('lmstudio: no lms CLI found — LM Studio is not installed on this machine.');
    console.log('Install LM Studio, or point LOCAL_LLM_BASE_URL at another OpenAI-compatible endpoint.');
    return 1;
  }
  console.log(`lmstudio: starting via ${lms}`);
  spawn(lms, ['server', 'start'], { stdio: 'ignore', detached: true }).unref();
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const status = await probe();
    if (!status.ok) continue;
    console.log(`lmstudio: ready (${status.models.join(', ') || 'no models downloaded'})`);
    // Downloading a model is a permissioned step, so stop short of it here.
    if (!status.models.length) console.log('Ask the user before downloading a model.');
    return status.models.length ? 0 : 1;
  }
  console.log('lmstudio: did not become ready within 10s — start the LM Studio app manually.');
  return 1;
}

const commands = { doctor, start };
const requested = process.argv[2] || 'doctor';
const command = commands[requested];
if (!command) {
  console.log(`Unknown command "${requested}". Usage: local-llm.mjs [doctor|start]`);
  process.exitCode = 2;
} else process.exitCode = await command();

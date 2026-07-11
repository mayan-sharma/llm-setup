#!/usr/bin/env node
const providers = { ollama: ['http://127.0.0.1:11434/api/tags', 'models', 'name'], lmstudio: ['http://127.0.0.1:1234/v1/models', 'data', 'id'] };
let ready = false;
for (const [name, [url, collection, key]] of Object.entries(providers)) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const models = (body[collection] || []).map(item => item[key] || '?');
    console.log(`${name}: ready (${models.join(', ') || 'no models installed'})`); ready = true;
  } catch (error) { console.log(`${name}: unavailable (${error.message})`); }
}
process.exitCode = ready ? 0 : 1;


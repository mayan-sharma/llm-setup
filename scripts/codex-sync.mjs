#!/usr/bin/env node
// Back-compat alias. The unified CLI is agents.mjs; this maps the old verbs onto it
// so existing muscle memory and docs keep working.
//   codex-sync.mjs publish ...  ->  agents.mjs push ...
//   codex-sync.mjs sync|status  ->  agents.mjs sync|status
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
if (argv[0] === 'publish') argv[0] = 'push';
const result = spawnSync(process.execPath, [path.join(here, 'agents.mjs'), ...argv], { stdio: 'inherit' });
process.exit(result.status ?? 1);

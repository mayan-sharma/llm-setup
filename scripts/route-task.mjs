#!/usr/bin/env node
const task = process.argv.find((value, index) => index > 1 && !value.startsWith('--'));
if (!task) { console.error('usage: route-task.mjs "task description" [--json]'); process.exit(2); }
const text = task.toLowerCase();
const has = words => words.some(word => text.includes(word));
let result;
if (has(['security', 'production', 'migration', 'architecture', 'incident', 'legal'])) result = { lane: 'frontier-review', reason: 'High-impact work benefits from stronger reasoning and explicit verification.', local_ok: false };
else if (has(['secret', 'private', 'credential', 'patient', 'customer data', 'proprietary'])) result = { lane: 'local-private', reason: 'The description appears sensitive; keep data local if the local model is adequate.', local_ok: true };
else if (has(['format', 'rename', 'summarize', 'boilerplate', 'typo'])) result = { lane: 'fast', reason: 'The task looks bounded and mechanical.', local_ok: true };
else result = { lane: 'default', reason: 'No strong privacy, risk, or simplicity signal was detected.', local_ok: true };
console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : `${result.lane}: ${result.reason}`);


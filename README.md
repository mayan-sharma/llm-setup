# Personal agent environment bootstrap

One version-controlled repository that installs your skills, instructions, and tools into
**every coding-agent harness on a machine** — OpenAI Codex CLI, Claude Code, pi, and any
future harness — from a single `home/` payload. Push a skill from any harness, sync on any
device, use your custom setup everywhere.

Clone this repository, open it in your agent, and say:

> Read AGENTS.md and set up my personal agent environment.

`AGENTS.md` is the canonical operating manual (install model, sync rules, repository
rules); this README is the short human-facing overview.

## Layout

- `home/` — the exact payload installed everywhere: global personal instructions
  (`home/AGENTS.md`), `home/skills/`, Codex config profiles, and the optional
  dependency-free local-LLM MCP server.
- `adapters/<name>.json` — maps the payload into one harness. Adding a harness is one
  JSON file and no code; see `adapters/README.md`.
- `integrations/*.mcp.json` — declarative MCP registrations reconciled per harness.
- `scripts/` — cross-platform installer (`install.mjs` behind `bootstrap.ps1` /
  `bootstrap.sh`), unified CLI (`agents.mjs`), and drift verifier (`verify.mjs`).

Skills and helper tools install once to the shared standard location `~/.agents/`
(override with `$AGENTS_HOME`); harnesses that do not read it yet (Claude Code) also get a
private copy. Authentication, keys, history, sessions, logs, and caches are never
versioned — secrets belong in the OS keychain or environment variables.

## Commands

Install (Windows, then macOS/Linux):

```sh
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
bash scripts/bootstrap.sh
node scripts/verify.mjs
```

Publish a skill from one machine, pull it on another:

```sh
node scripts/agents.mjs push my-skill --dry-run   # preview, then add --commit --push
node scripts/agents.mjs sync                      # clean checkout, ff-only pull, reinstall
```

`node scripts/agents.mjs targets` shows what a machine will install; `doctor` lints skills
for cross-harness portability and runs on every `push` and `verify`. Re-running install is
safe — differing destination files are first backed up under
`.bootstrap-backups/<timestamp>/`. Restart each affected harness afterward.

## Notes

- Codex profiles: `codex --profile deep-review`, `codex --oss --local-provider lmstudio`.
- The optional local-LLM MCP server installs to `~/.agents/tools/local-llm/server.py` and
  registers into every MCP-capable harness; the `local-llm` skill carries the offload
  policy and configuration. Start the endpoint with `node scripts/local-llm.mjs start`,
  diagnose it with `doctor`.
- Checkpoints: `node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs"
  create|show|list`; the `checkpoint` skill carries the workflow.
- Customize by editing `home/` or `adapters/`, committing, and rerunning bootstrap. Never
  edit installed copies; `verify.mjs` reports drift.
- Pin per-machine targets with a git-ignored `targets.local.json`:
  `{ "targets": ["codex", "claude"] }`.

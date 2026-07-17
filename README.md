# Personal agent environment bootstrap

One version-controlled repository that installs your skills, instructions, and tools into
**every coding-agent harness on a machine** — OpenAI Codex CLI, Claude Code, pi, and any
future harness — from a single payload. Push a skill from any harness, sync on any device,
use your custom setup everywhere.

Clone this repository, open it in your agent (Codex or Claude), and say:

> Read AGENTS.md and set up my personal agent environment.

## How it works

- `home/` is the exact payload copied out on install: skills, a canonical `AGENTS.md`,
  Codex config profiles, and the optional local-LLM MCP server.
- Skills and helper tools install once to the **shared standard location** `~/.agents/`
  (override with `$AGENTS_HOME`), which Codex and pi read directly. Harnesses that do not
  read it yet (Claude Code) also receive a private copy.
- `adapters/<name>.json` maps the payload into one harness. **Adding a harness is one JSON
  file and no code.** See `adapters/README.md`.
- The installer targets every harness it auto-detects. Pin an explicit set per machine with
  a git-ignored `targets.local.json` (`{ "targets": ["codex", "claude"] }`).

## What is versioned

- `home/AGENTS.md` — global personal instructions (installed as `AGENTS.md` for Codex/pi
  and inlined into `CLAUDE.md` for Claude Code).
- `home/config.toml`, `home/*.config.toml` — Codex global defaults and named profiles.
- `home/skills/` — reusable checkpoint, sync, local-LLM, and task-routing workflows.
- `home/local-llm/server.py` — optional dependency-free local-LLM MCP server.
- `adapters/*.json` — harness adapters.
- `integrations/*.mcp.json` — declarative MCP registrations reconciled per harness.
- `scripts/` — the cross-platform installer, unified CLI, verifier, and helper tools.

## What is never versioned

Per-harness authentication, keys, history, sessions, logs, caches, databases, and installed
plugin state stay in the real harness homes. Put secrets in the OS keychain or environment
variables, never in this repository.

## Manual setup

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
node scripts/verify.mjs
```

macOS/Linux:

```sh
bash scripts/bootstrap.sh
node scripts/verify.mjs
```

Both wrappers delegate to `node scripts/install.mjs`. Use `--dry-run` (or `-DryRun`) to
preview and `--all` to install for every adapter regardless of detection. Re-running is
safe; a differing destination file is backed up under `.bootstrap-backups/<timestamp>/`
before replacement. Inspect what a machine will target with:

```sh
node scripts/agents.mjs targets
```

Restart each affected harness after bootstrap so it rediscovers instructions, config, and
skills.

## Publish on one computer, use on another

After creating or refining a personal skill, ask your agent:

> Publish this skill to my personal repository and push it.

The agent previews and validates the skill, runs the portability doctor, copies the whole
directory into `home/skills/`, commits only that directory, and pushes. The equivalent
commands:

```sh
node scripts/agents.mjs push my-skill --dry-run
node scripts/agents.mjs push my-skill --commit --push
```

On another computer, ask:

> Pull my latest setup and install it.

Or run:

```sh
node scripts/agents.mjs sync --dry-run
node scripts/agents.mjs sync
```

Sync refuses to pull over uncommitted changes, uses `git pull --ff-only`, installs every
enabled harness, and verifies drift. Publishing rejects likely secrets, private keys,
symbolic links, and user-specific absolute paths. `push` and `sync` are aliased from the
legacy `scripts/codex-sync.mjs publish`/`sync` for back-compat.

## Portability

Because one skill installs into many harnesses, skills must avoid harness-specific
assumptions. Reference helper tools as `${AGENTS_HOME:-$HOME/.agents}/tools/<tool>`, keep
frontmatter to the portable core, and remember that MCP-dependent skills will not work in
harnesses without MCP (e.g. pi). The `doctor` enforces this:

```sh
node scripts/agents.mjs doctor
```

It runs automatically on every `push` and as part of `verify`.

## Codex profiles and optional tools

Profiles are Codex-specific separate files:

```sh
codex --profile deep-review
codex --oss --local-provider ollama
codex --oss --local-provider lmstudio
```

Diagnose local providers with `node scripts/local-llm.mjs doctor`; get routing advice with
`node scripts/route-task.mjs "your task"`. Routing only recommends a lane — it never
launches work or sends data.

### Optional local-LLM MCP

The dependency-free local-LLM MCP server installs to `~/.agents/tools/local-llm/server.py`
and is registered into every harness that supports MCP (Codex, Claude); harnesses without
MCP skip it. It lets the agent proactively offload bounded, low-risk drafts, summaries, and
first-pass reviews while requiring primary-model verification of material output.

The server does not contact, start, download, or remove a model; an endpoint is needed only
when a tool is invoked. It defaults to LM Studio at `http://localhost:1234/v1` and records
each successful delegation in `~/.agents/local-llm/usage.sqlite`. Read the totals through
the MCP's non-inference `usage_summary` tool. Treat local completion tokens as a gross
frontier-output-offload proxy, not exact net cloud-token savings. The database and model
files are never versioned.

To add a future MCP, drop its portable source under `home/` and one
`integrations/<name>.mcp.json` manifest (use `{AGENTS_TOOLS}` for paths).

## Checkpoints

Create a repository checkpoint (git evidence plus conversation-reported context) with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" create --objective "outcome" --next "next action"
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" show latest
```

Checkpoint files go into the current repository's ignored `.checkpoints/` directory.

## Customizing

Edit files under `home/` (or `adapters/`), commit, and rerun bootstrap. Do not edit
installed copies and expect changes to flow back. `scripts/verify.mjs` reports drift between
the tracked payload and each harness home.

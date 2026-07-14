# Personal Codex bootstrap

Clone this repository, open it in Codex, and say:

> Read AGENTS.md and set up my personal Codex environment.

The repository installs a small, version-controlled payload into `CODEX_HOME` (normally `~/.codex`) without copying machine-local state.

## What is versioned

- `home/AGENTS.md` — global personal instructions.
- `home/config.toml` — conservative global defaults.
- `home/*.config.toml` — named CLI profiles.
- `home/skills/` — reusable checkpoint, sync, local-LLM, and task-routing workflows.
- `home/local-llm/server.py` — optional dependency-free MCP server for a local OpenAI-compatible model endpoint.
- `integrations/*.mcp.json` — declarative MCP registrations reconciled automatically by bootstrap and sync.
- `scripts/` — cross-platform bootstrap, verification, publishing, synchronization, checkpoint, and local tools.

## What is never versioned

Codex authentication, keys, history, sessions, logs, caches, databases, and installed plugin state stay in the real `CODEX_HOME`. Put secrets in the OS keychain or environment variables, never in this repository.

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

Set `CODEX_HOME` before running to target a non-default directory. Re-running is safe. If a destination file differs, the installer saves it under `.bootstrap-backups/<timestamp>/` in this repository before replacing it. Use `--dry-run` (Unix) or `-DryRun` (PowerShell) to preview.

Restart Codex after bootstrap so global instructions, configuration, and skills are rediscovered.

## Publish on one computer, use on another

After creating or refining a personal skill, ask Codex:

> Publish this skill to my personal Codex repository and push it.

Codex previews and validates the skill, copies the complete directory into `home/skills/`, commits only that directory, and pushes it. The equivalent command is:

```sh
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" publish my-skill --dry-run
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" publish my-skill --commit --push
```

On another computer, ask:

> Pull my latest personal Codex setup and install it.

Codex will pull the repository, install its payload, and reconcile every checked-in MCP integration—no follow-up shell commands are needed.

Or run:

```sh
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" sync --dry-run
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" sync
```

Sync refuses to pull over uncommitted bootstrap-repository changes and uses `git pull --ff-only`. Publishing rejects likely secrets, private keys, symbolic links, and user-specific absolute paths. Work-owned or confidential skills should remain in a separate approved repository, not this personal one.

## Profiles and optional tools

Profiles are separate files, matching current Codex profile behavior:

```sh
codex --profile deep-review
codex --oss --local-provider ollama
codex --oss --local-provider lmstudio
```

The local providers are optional. Diagnose them with `node scripts/local-llm.mjs doctor`; list routing advice with `node scripts/route-task.mjs "your task"`. Routing only recommends a lane—it never launches work or sends data.

### Optional local-LLM MCP

Bootstrap and sync automatically install and register the complete dependency-free local-LLM MCP server. It does not contact, start, download, or remove a model; an endpoint is needed only when you invoke one of its tools. The server defaults to LM Studio at `http://localhost:1234/v1` and writes only local aggregate usage metadata to `$CODEX_HOME/local-llm/usage.sqlite`. That database, model files, and other runtime state are never versioned.

To add a future MCP, add its portable source to `home/` and one `integrations/<name>.mcp.json` manifest. Bootstrap/sync reconciles that named MCP automatically, without changing unrelated MCP entries.

Create a repository checkpoint with:

```sh
node scripts/checkpoint.mjs create --note "what remains"
```

Checkpoint files go into the current repository's ignored `.checkpoints/` directory by default.

## Customizing

Edit files under `home/`, commit them, and rerun bootstrap. Do not edit installed copies and expect those changes to flow back automatically. `scripts/verify.mjs` reports drift between the tracked payload and `CODEX_HOME`.

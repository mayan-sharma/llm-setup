# Personal agent environment bootstrap

This repository is the source of truth for the owner's personal agent environment. It
installs one versioned `home/` payload into every coding-agent harness on a machine —
Codex CLI, Claude Code, pi, and any future harness — from a single set of files.

## How it installs (the model)

- `home/` is the exact payload: skills, canonical `AGENTS.md`, Codex config profiles, and
  the optional local-LLM MCP server.
- `adapters/<name>.json` teaches the installer how to map that payload into one harness.
  Adding a harness is one JSON file and no code.
- Skills and helper tools install to the shared standard location `~/.agents/`
  (`$AGENTS_HOME`), which Codex and pi read directly. Harnesses that do not read it yet
  (Claude Code) get a private copy via their adapter.
- `scripts/install.mjs` (Node, cross-platform) is the real installer. `bootstrap.sh` and
  `bootstrap.ps1` are thin wrappers around it.
- `scripts/agents.mjs` is the unified CLI (`push`, `sync`, `install`, `targets`,
  `doctor`, `status`). `scripts/codex-sync.mjs` is a back-compat alias.

## Bootstrap request

When the user asks to set up their environment:

1. Read this file and `README.md` completely.
2. Inspect the working tree. Do not overwrite uncommitted repository changes.
3. Run the installer from the repository root:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1`
   - macOS/Linux: `bash scripts/bootstrap.sh`
   - Either delegates to `node scripts/install.mjs`; pass `--dry-run` to preview and
     `--all` to install for every adapter regardless of detection.
4. Run `node scripts/verify.mjs` and resolve any reported failure that is safe and in scope.
5. Report which harnesses were targeted, what was installed and backed up, which MCP
   integrations were reconciled, optional dependencies that are absent, and which
   harnesses must be restarted.

## Synchronization requests

- For "publish/save/push this skill", use the `agent-environment-sync` skill and
  `node scripts/agents.mjs push <name>`. Preview first; only `--commit`/`--push` when the
  user explicitly asks for those Git actions.
- For "fetch/pull/sync my setup", use `node scripts/agents.mjs sync`; it requires a clean
  checkout, pulls fast-forward-only, installs every enabled harness, and verifies drift.
- Never synchronize employer-owned content, credentials, confidential context, runtime
  state, or machine-specific paths.

The bootstrap is intentionally non-destructive. Authentication, history, sessions, logs,
caches, and plugin state in each harness home are never sourced from this repository.
MCP integrations declared in `integrations/*.mcp.json` are reconciled per adapter so
pushed features become usable automatically.

## Repository rules

- Keep the installer idempotent, dependency-light (Node only), and cross-platform.
- Never commit credentials, tokens, `auth.json`, conversation history, or machine-specific
  absolute paths.
- Treat `home/` as the exact payload. Skills must stay portable: reference helper tools as
  `${AGENTS_HOME:-$HOME/.agents}/tools/<tool>`, never a harness-specific path.
- When adding a personal MCP, keep its portable code under `home/` and add
  `integrations/<name>.mcp.json`; use `{AGENTS_TOOLS}` for the server path.
- When supporting a new harness, add `adapters/<name>.json` only.
- Keep optional integrations opt-in. A fresh bootstrap must work without Ollama, LM Studio,
  or any particular harness present.
- Add reusable workflows as `home/skills/<name>/SKILL.md`; keep supporting scripts beside
  the skill. Publishing must validate the whole skill directory and stage nothing unrelated.
- Before finishing changes, run `node scripts/verify.mjs`, `node scripts/agents.mjs doctor`,
  and review `git diff --check`.

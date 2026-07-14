# Personal Codex bootstrap

This repository is the source of truth for the owner's personal Codex environment.

## Bootstrap request

When the user asks to "set up my personal Codex environment":

1. Read this file and `README.md` completely.
2. Inspect the working tree. Do not overwrite uncommitted repository changes.
3. Determine the platform and `CODEX_HOME` (`$CODEX_HOME`, otherwise `~/.codex`).
4. Run the matching installer from the repository root:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1`
   - macOS/Linux: `bash scripts/bootstrap.sh`
5. Run `node scripts/verify.mjs` and resolve any reported failure that is safe and in scope.
6. Report what was installed, what was backed up, which managed MCP integrations were reconciled, optional dependencies that are absent, and whether Codex must be restarted.

## Synchronization requests

- For "publish/save/push this skill", use the `codex-environment-sync` skill and `scripts/codex-sync.mjs publish`.
- Preview first. Only use `--commit` or `--push` when the user explicitly requests those Git actions.
- For "fetch/pull/sync my Codex setup", use `scripts/codex-sync.mjs sync`; it requires a clean checkout and pulls fast-forward-only.
- Never synchronize employer-owned content, credentials, confidential context, runtime state, or machine-specific paths.

The bootstrap is intentionally non-destructive. Authentication, history, sessions, logs, caches, plugins, and other runtime state in `CODEX_HOME` are never sourced from this repository. MCPs declared in `integrations/*.mcp.json` are an exception: bootstrap and sync reconcile only those named MCP entries so that pushed features become usable automatically.

## Repository rules

- Keep installers idempotent and dependency-light.
- Never commit credentials, tokens, `auth.json`, conversation history, or machine-specific absolute paths.
- Treat `home/` as the exact version-controlled payload copied into `CODEX_HOME`.
- When adding a personal MCP, keep its portable code/configuration under `home/` and add `integrations/<name>.mcp.json`; bootstrap and sync register or update that named MCP automatically.
- Keep optional integrations opt-in. A fresh bootstrap must work without Ollama, LM Studio, or a routing helper.
- Add reusable workflows as `home/skills/<name>/SKILL.md`; keep supporting scripts beside the skill when practical.
- Publishing must validate the entire skill directory and must not stage unrelated files.
- Before finishing changes, run `node scripts/verify.mjs` and review `git diff --check`.

# Harness adapters

Each `<name>.json` file teaches the installer how to map the single `home/` payload
into one agent harness. Adding support for a new harness is one JSON file and no code.

The installer (`scripts/install.mjs`) resolves a **shared standard location**
(`$AGENTS_HOME`, default `~/.agents`) once, then applies every enabled adapter.

## Shared standard location

Skills and helper tools install to `~/.agents/` because it is the cross-agent
convention that Codex (`$HOME/.agents/skills`), pi (`~/.agents/skills`), and future
conformant harnesses already read. Adapters with `"skills": "shared"` rely on it and
receive no private copy. Adapters with `"skills": "private"` also get skills copied
into their own home (for harnesses that do not read the shared path yet, e.g. Claude
Code).

Helper tools (`checkpoint.mjs`, `local-llm.mjs`, `agents.mjs`) always
install to `~/.agents/tools/`, and the optional local-LLM MCP server to
`~/.agents/tools/local-llm/server.py`, so skills can reference them the same way from
any harness.

## Adapter fields

| Field | Meaning |
| --- | --- |
| `name` | Adapter id; also the `<name>.json` filename. |
| `displayName` | Human-readable harness name for logs. |
| `detect` | How to auto-detect the harness: `env` vars set, `paths` that exist, or `bin` on `PATH`. Any match counts. |
| `home` | Harness config home: `env` var to honor and `~`-relative `default`. |
| `skills` | `"shared"` (rely on `~/.agents/skills`) or `"private"` (also copy into `<home>/skills`). |
| `instructions` | `file` to write in `<home>`; `mode` is `copy` (verbatim `AGENTS.md`) or `import-agents` (generate a file that imports the canonical `AGENTS.md`). |
| `extraFiles` | Payload files copied verbatim into `<home>` (e.g. Codex `config.toml` profiles). Paths are relative to `home/`. |
| `mcp` | MCP registration method: `codex-cli`, `claude-cli`, or `none`. |
| `restartNote` | Printed after install so the user knows to reload that harness. |

## Enabling targets per machine

By default the installer installs into every harness it **auto-detects**. To pin an
explicit set on a given machine, create a git-ignored `targets.local.json` at the repo
root:

```json
{ "targets": ["codex", "claude"] }
```

Only listed adapters are installed on that machine; absent harnesses are skipped
silently so `sync` never fails because a device lacks a harness.

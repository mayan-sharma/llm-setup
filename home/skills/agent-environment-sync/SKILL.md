---
name: agent-environment-sync
description: Publish a reusable personal skill to the version-controlled agent bootstrap repository, or pull and install the latest personal environment on another computer, across every configured harness (Codex, Claude Code, pi, and more).
---

# Agent environment sync

Use this skill when the user asks to publish, save, push, pull, fetch, install, or
synchronize personal skills or environment files through the bootstrap repository. It
works the same from inside any harness; the tools install to `~/.agents/tools/`.

## Publish a skill

1. Identify the complete skill directory. Prefer the shared `~/.agents/skills/<name>`
   (also found under any harness home such as `~/.codex/skills` or `~/.claude/skills`);
   an explicit path is also accepted.
2. Confirm it is personal and portable. Do not publish employer-owned material,
   confidential context, credentials, generated caches, or machine-specific absolute
   paths.
3. Preview with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/agents.mjs" push <name-or-path> --dry-run
```

4. Publish into the local repository with `push <name-or-path>`.
5. If the user explicitly says commit, add `--commit`; to push, add `--commit --push`.
   These flags stage and commit only that skill directory.
6. `push` validates the skill and runs the portability `doctor` automatically, so a
   Codex-only path or MCP dependence surfaces before it reaches another machine.
7. Report the commit and push result. Never claim another machine has received it until
   that machine syncs.

## Sync a computer

Preview remote and installed changes with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/agents.mjs" sync --dry-run
```

Then run `sync`. It requires a clean bootstrap checkout, performs `git pull --ff-only`,
runs the multi-harness installer for every harness detected (or pinned in
`targets.local.json`), and verifies installed drift. Use `--no-pull` to install the
current local checkout, and `--all` to install for every adapter regardless of
detection.

Inspect which harnesses a machine will install into with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/agents.mjs" targets
```

Restart each affected harness after installed skills or global instructions change.
Authentication, sessions, history, caches, plugins, and machine-local secrets are never
synchronized.

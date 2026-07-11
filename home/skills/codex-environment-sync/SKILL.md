---
name: codex-environment-sync
description: Publish a reusable personal skill to the version-controlled Codex bootstrap repository, or pull and install the latest personal Codex environment on another computer.
---

# Codex environment sync

Use this skill when the user asks to publish, save, push, pull, fetch, install, or synchronize personal Codex skills or environment files through the bootstrap repository.

## Publish a skill

1. Identify the complete skill directory. Prefer `$CODEX_HOME/skills/<name>`; an explicit path is also accepted.
2. Confirm it is personal and portable. Do not publish employer-owned material, confidential context, credentials, generated caches, or machine-specific absolute paths.
3. Preview with:

```sh
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" publish <name-or-path> --dry-run
```

4. Publish into the local repository with `publish <name-or-path>`.
5. If the user explicitly says commit, commit it with `--commit`. If the user explicitly says push, use `--commit --push`. These flags stage and commit only that skill directory.
6. Report the commit and push result. Never claim another machine has received it until that machine syncs.

## Sync a computer

Preview remote and installed changes with:

```sh
node "$CODEX_HOME/bootstrap-tools/codex-sync.mjs" sync --dry-run
```

Then run `sync`. It requires a clean bootstrap checkout, performs `git pull --ff-only`, runs the platform installer, and verifies installed drift. Use `--no-pull` only when the user wants to install the current local checkout.

Restart Codex after installed skills or global instructions change. Authentication, sessions, history, caches, plugins, and machine-local secrets are never synchronized.


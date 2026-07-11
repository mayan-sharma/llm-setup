---
name: checkpoint-handoff
description: Create a durable local checkpoint or a concise handoff for long, interrupted, or transferred repository work.
---

# Checkpoint and handoff

Use this skill when the user asks to checkpoint, pause, resume, or hand off work, or when an explicitly long-running task needs a recovery point.

From the target repository, run the versioned helper installed with this environment:

```sh
node ~/.codex/bootstrap-tools/checkpoint.mjs create --note "next action"
```

On Windows, use `$env:USERPROFILE\.codex\bootstrap-tools\checkpoint.mjs` when `CODEX_HOME` is not set. The helper records repository path, branch, HEAD, working-tree status, changed files, recent commits, and the note. It does not stage, commit, stash, or modify source files.

For a conversational handoff, summarize:

1. Objective and decisions.
2. Completed changes with file paths.
3. Verification performed and results.
4. Remaining steps in execution order.
5. Risks, blockers, and uncommitted state.

Do not include secrets or paste full diffs into checkpoint notes.

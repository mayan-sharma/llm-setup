---
name: checkpoint
description: Save, list, resume, or hand off an evidence-grounded repository checkpoint. Use when the user invokes /checkpoint or $checkpoint, asks to save current state, capture progress, persist context, make a compact handoff packet, hand off this thread, list saved checkpoints, resume saved work, continue from a handoff, or inspect a checkpoint.
argument-hint: "[save <name> | list | resume <name|latest> | handoff]"
---

# Checkpoint

One helper, four modes: `save` (default), `list`, `resume`, `handoff`. Optimize for accurate
resumption, not narrative completeness.

Helper: `node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs"`, run from the repository root.

## Save

1. Use facts already present in the conversation. Do not reread the repository, inspect diffs, run tests, or reconstruct old decisions.
2. Record only these context fields:
   - objective: the user's current requested outcome
   - completed: changes known to have been made; say `not verified` when uncertain
   - decision: only an explicit decision that constrains future work
   - verification: commands and outcomes already observed
   - blocker: an active blocker or material risk, otherwise omit
   - next: one executable next action
3. Run:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" create \
  --name "short-name" \
  --objective "requested outcome" \
  --completed "verified work, or not verified" \
  --decision "explicit constraint, if any" \
  --verification "observed command result, or not run" \
  --blocker "active blocker, if any" \
  --next "single next action"
```

Omit empty optional flags. The helper mechanically captures repository path, branch, HEAD, status, changed files, and recent commits. These Git fields are evidence; the context fields are conversation-reported notes.

4. Return the checkpoint name/path and the resume command:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" show <name>
```

## List

Run `checkpoint.mjs list` from the target repository and return the compact output (name,
creation time, next action). Do not open every checkpoint or summarize their contents unless
asked to inspect one.

## Resume

Load with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" show <name-or-latest>
```

The command compares the saved Git snapshot with the current branch, HEAD, and status. Then:

1. Treat saved Git fields and the current comparison as evidence.
2. Treat objective, completed, decision, verification, blocker, and next action as conversation-reported notes. Verify any consequential claim before relying on it.
3. If Git changed, inspect only the changed state needed to reconcile the recorded next action. Do not blindly continue against stale assumptions.
4. State any mismatch briefly, then continue with the next action when safe. Ask only if the mismatch creates a materially ambiguous or destructive choice.

Do not restate the whole packet, dump JSON, search old threads, or produce a new summary before working. Use `--json` only when structured checkpoint data is needed.

## Handoff

When the user wants to continue in a fresh thread or session, save a checkpoint as above, then
start a new thread if thread tools are available (otherwise return this prompt for the user to
paste):

```text
Use /checkpoint resume <name>. Verify the saved Git snapshot against the current working
tree, then continue with the recorded next action. Treat conversation-reported fields as
notes, not repository evidence.
```

Do not archive the current thread unless explicitly asked, and do not write a second
summary: the checkpoint is the handoff packet.

## Accuracy rules

- Never claim a file was changed, command succeeded, or decision was made unless the current conversation proves it.
- Use `unknown` or `not verified` instead of filling gaps with plausible detail.
- Do not call local models, subagents, thread-history search, or broad repository tools.
- Do not include secrets, raw diffs, long command output, speculation, or a general conversation summary.
- Use a detailed handoff only when the user explicitly requests one; even then, keep facts and inference visibly separate.

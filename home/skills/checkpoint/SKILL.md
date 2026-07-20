---
name: checkpoint
description: Save a fast, evidence-grounded repository checkpoint, list saved checkpoints, or hand work off to a new thread. Use when the user invokes $checkpoint, asks to save current state, capture progress, persist context, create a resumable summary, make a compact handoff packet, hand off this thread, or list saved checkpoints.
---

# Checkpoint

Create a checkpoint in one pass. Optimize for accurate resumption, not narrative completeness.

## Workflow

1. Use facts already present in the conversation. Do not reread the repository, inspect diffs, run tests, or reconstruct old decisions.
2. Record only these context fields:
   - objective: the user's current requested outcome
   - completed: changes known to have been made; say `not verified` when uncertain
   - decision: only an explicit decision that constrains future work
   - verification: commands and outcomes already observed
   - blocker: an active blocker or material risk, otherwise omit
   - next: one executable next action
3. Run the installed helper from the repository root:

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

4. Return the checkpoint name/path and this exact resume command:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" show <name>
```

## Listing checkpoints

When the user asks what checkpoints exist, run `checkpoint.mjs list` from the target
repository and return the compact output (name, creation time, next action). Do not open
every checkpoint or summarize their contents unless asked to inspect one.

## Handing off to a new thread

When the user wants to continue in a fresh thread or session, create the checkpoint as
above, then start a new thread if thread tools are available (otherwise return the prompt
for the user to paste):

```text
Use $resume-checkpoint <name>. Verify the saved Git snapshot against the current working
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

---
name: handoff-thread
description: Save an evidence-grounded checkpoint and continue repository work in a new Codex thread. Use when the user invokes $handoff-thread, asks to hand off this thread, continue in a fresh thread, checkpoint and resume elsewhere, or reduce context by moving work to a new thread.
---

# Handoff Thread

Create one checkpoint in a single pass. Use only facts already established in the conversation; do not inspect diffs, rerun tests, search thread history, or reconstruct missing details. Use `unknown` or `not verified` for uncertainty.

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" create \
  --name "short-name" \
  --objective "requested outcome" \
  --completed "verified work, or not verified" \
  --verification "observed result, or not run" \
  --next "single next action"
```

Add `--decision` or `--blocker` only when the conversation establishes one. The helper captures Git evidence mechanically. Do not put secrets, speculation, raw diffs, or long output in context fields.

After the checkpoint succeeds:

1. Create a new Codex thread for the current project when thread tools are available.
2. Use this prompt, substituting the saved name:

```text
Use $resume-checkpoint <name>. Verify the saved Git snapshot against the current working tree, then continue with the recorded next action. Treat conversation-reported fields as notes, not repository evidence.
```

3. Return the checkpoint name, new thread identifier, and resume prompt.

Do not archive the current thread unless explicitly asked. If thread tools are unavailable, return the prompt for the user to paste. Do not add another summary: the checkpoint is the handoff packet.

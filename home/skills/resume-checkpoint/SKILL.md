---
name: resume-checkpoint
description: Resume or inspect an evidence-grounded repository checkpoint. Use when the user invokes $resume-checkpoint, asks to resume saved work, restore checkpoint context, continue from a handoff, inspect a checkpoint, or load a compact handoff packet.
---

# Resume Checkpoint

Load the checkpoint with:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" show <name-or-latest>
```

The command compares the saved Git snapshot with the current branch, HEAD, and status.

Then:

1. Treat saved Git fields and the current comparison as evidence.
2. Treat objective, completed, decision, verification, blocker, and next action as conversation-reported notes. Verify any consequential claim before relying on it.
3. If Git changed, inspect only the changed state needed to reconcile the recorded next action. Do not blindly continue against stale assumptions.
4. State any mismatch briefly, then continue with the next action when safe. Ask only if the mismatch creates a materially ambiguous or destructive choice.

Do not restate the whole packet, dump JSON, search old threads, or produce a new summary before working. Use `--json` only when structured checkpoint data is needed.

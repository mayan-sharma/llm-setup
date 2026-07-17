---
name: checkpoint-handoff
description: Compatibility workflow for creating a durable repository checkpoint or concise handoff. Use when the user explicitly invokes $checkpoint-handoff or asks for the legacy checkpoint-and-handoff workflow.
---

# Checkpoint Handoff

Create one checkpoint with the installed helper:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" create \
  --objective "requested outcome" \
  --completed "verified work, or not verified" \
  --verification "observed result, or not run" \
  --next "single next action"
```

Use only facts already established in the conversation. Do not inspect diffs, rerun tests, reconstruct missing details, create a second summary, or use a separate store. The helper mechanically captures Git evidence.

For a new thread, use:

```text
Use $resume-checkpoint <name>. Verify the saved Git snapshot, then continue with the recorded next action.
```

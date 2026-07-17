---
name: list-checkpoints
description: List saved repository checkpoints. Use when the user invokes $list-checkpoints, asks to show checkpoint history, find a saved checkpoint, locate resumable work, or inspect available handoff packets.
---

# List Checkpoints

From the target repository, run:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/checkpoint.mjs" list
```

Return the compact output: name, creation time, and next action. Do not open every checkpoint, dump JSON, or summarize their contents unless the user asks to inspect one.

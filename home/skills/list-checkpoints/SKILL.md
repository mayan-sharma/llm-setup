---
name: list-checkpoints
description: List saved Codex handoff checkpoints. Use when the user invokes $list-checkpoints, asks to list checkpoints, show saved checkpoints, find previous checkpoints, inspect checkpoint history, locate resumable Codex thread states, or find compressed handoff packets.
---

# List Checkpoints

List recent compact Codex checkpoints.

Use:

```bash
python3 ~/.codex/checkpoints/checkpoints.py list
```

Add `--project <filter>` when the user provides a repo, project, or cwd filter.

Present results compactly with:

- checkpoint id
- name
- project
- updated time
- goal/status or handoff preview
- next step

Do not dump raw JSON unless requested.

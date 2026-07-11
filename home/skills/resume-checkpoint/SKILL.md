---
name: resume-checkpoint
description: Resume or inspect a saved Codex handoff checkpoint. Use when the user invokes $resume-checkpoint, asks to resume a checkpoint, restore saved context, continue from a checkpoint, load checkpoint state, brief the current thread from a previous checkpoint, or start from a compressed handoff packet.
---

# Resume Checkpoint

Load a compact checkpoint and use it as a fresh-thread handoff packet.

Use one of:

```bash
python3 ~/.codex/checkpoints/checkpoints.py show <name>
python3 ~/.codex/checkpoints/checkpoints.py show --id <id>
```

After loading:

1. Internalize the checkpoint.
2. Prefer the `handoff_brief` as the authoritative compressed context.
3. Summarize where work left off.
4. Call out pending tasks, blockers, files, and commands worth checking.
5. Show the saved `resume_prompt` when present.
6. Recommend the next concrete step.

Do not dump raw JSON unless requested.

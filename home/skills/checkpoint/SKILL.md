---
name: checkpoint
description: Quickly create or update a compact Codex handoff checkpoint. Use when the user invokes $checkpoint, asks to create a checkpoint, save current thread state, capture progress, persist current context, create a resumable summary, or make a compressed handoff packet for a fresh Codex thread.
---

# Checkpoint

Default to a fast checkpoint. The goal is a quick fresh-thread handoff, not a full report.

## Fast Default

1. Pick a name from the user argument, or generate `checkpoint-YYYY-MM-DD-HHMMSS`.
2. Gather only cheap state:
   - `pwd`
   - `git branch --show-current`
   - `git status --short`
   - current goal/status from conversation context
   - immediate next step from conversation context
3. Save with:

```bash
python3 ~/.codex/checkpoints/checkpoints.py save
```

Use JSON on stdin with only these fields:

```json
{
  "name": "short-name",
  "project": "repo-or-project",
  "cwd": "/absolute/path",
  "git_branch": "branch",
  "git_status": "short status",
  "summary": "1-3 sentence checkpoint summary",
  "handoff_brief": "under 250 words; enough for a fresh thread to continue",
  "resume_prompt": "under 120 words; pasteable fresh-thread prompt",
  "next_step": "single next action"
}
```

4. Final response must be brief: checkpoint name, project, and resume prompt.

## Deep Checkpoint

Use this only when the user explicitly says `deep`, `full`, `detailed`, `audit`, or asks for a complete packet.

In deep mode, include files, commands, decisions, blockers, and validation. Keep the handoff concise.

## Constraints

- Do not use `local_llm` during fast checkpoint creation.
- Do not inspect checkpoint schemas, broad diffs, logs, or repo files unless saving fails or the user asks for deep mode.
- Do not run tests, builds, validation, or cleanup just to create a checkpoint.
- Do not enumerate every changed file in fast mode unless already obvious from `git status --short`.

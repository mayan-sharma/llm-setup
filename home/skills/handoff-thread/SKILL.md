---
name: handoff-thread
description: Quickly save a compact checkpoint and continue in a new Codex thread. Use when the user invokes $handoff-thread, asks to hand off this thread, start a fresh thread from current context, continue in a new thread, checkpoint and resume elsewhere, or reduce context by moving work to a new thread.
---

# Handoff Thread

Default to a fast handoff. Do not over-research the repo, inspect checkpoint schemas, enumerate every file, or produce a long packet unless the user explicitly asks for a deep handoff.

## Fast Default

1. Pick a name from the user argument, or generate `handoff-YYYY-MM-DD-HHMMSS`.
2. Gather only cheap state:
   - `pwd`
   - `git branch --show-current`
   - `git status --short`
   - a one-paragraph summary from current conversation context
3. Save a compact checkpoint with `python3 ~/.codex/checkpoints/checkpoints.py save`.
   - Include only: `name`, `project`, `cwd`, `git_branch`, `git_status`, `summary`, `handoff_brief`, `resume_prompt`, `next_step`.
   - Keep `handoff_brief` under 250 words.
   - Keep `resume_prompt` under 120 words.
   - Use a temp file only if it is faster/cleaner than stdin; delete it immediately.
4. Create a new thread when `list_projects` / `create_thread` are available.
   - Pick the project whose path equals the current `pwd`.
   - Use local environment.
   - Prompt:

```text
Use $resume-checkpoint <checkpoint-name> and continue from that handoff packet.
```

5. Final response includes only:
   - checkpoint name
   - new thread id, if created
   - the resume prompt

## Deep Handoff

Use this only when the user says `deep`, `full`, `detailed`, `audit`, or asks for a complete packet.

Add files, commands, decisions, blockers, validation, and next steps. Keep it concise and do not inspect formats unless saving fails.

## Constraints

- Do not archive the current thread unless explicitly asked.
- Do not run validation, builds, tests, or broad diffs just for a handoff.
- Do not include staged-file inventories in fast mode unless the file list is already known from context.
- If thread tools are unavailable, save the checkpoint and give the exact prompt to paste into a new thread.

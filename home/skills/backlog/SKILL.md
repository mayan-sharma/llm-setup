---
name: backlog
description: Keep a private per-repo backlog of bugs, ideas, and chores the user wants to park for later. Use when the user says "add to backlog", "backlog this", "park this", "what's in the backlog", "show the backlog", "#N is done", or "pick something from the backlog".
---

# Backlog

A private, per-repo list of things the user skipped and wants to pick up later. Add only
what the user asks to add; never log items on your own.

## Location

- Root: `git rev-parse --show-toplevel`; outside git, the current working directory.
- File: `<root>/.agents/backlog.md`. Create it (and `.agents/`) on first add.
- It stays local and personal. In a git repo, make sure it is ignored without touching
  committed files: if `git check-ignore -q .agents/backlog.md` fails, append
  `.agents/backlog.md` to the file named by `git rev-parse --git-path info/exclude`.
- Never commit, push, upload, or paste the file anywhere outside this machine.

## Format

```md
# Backlog

- [ ] 2026-10-29 · bug · src/render.py:142 · caption timing drifts on clips over 3 min
- [ ] 2026-10-29 · idea · — · cache voice renders between runs
- [x] 2026-10-20 · chore · package.json · drop unused lodash dep · done 2026-10-29
```

- Fields: date added, type (`bug`, `idea`, or `chore`), location (`path:line`, a path,
  or `—`), one-line note in the user's words, tightened.
- Append new items at the end. Keep closed items; never delete lines unless asked.

## Add

- Infer type and location from the conversation; don't ask unless the item is unclear.
- Several items in one request become several lines.
- Confirm in one line (`Backlogged: <note>`), then return to the current task. Adding an
  item never means fixing it.

## List

- Read open items (`- [ ]`) in file order and number them 1..N, one line each:
  `3. bug · src/render.py:142 · caption timing drifts`.
- No file or no open items: say the backlog is empty.
- Show closed items only when asked.

## Close and pick

- "#N is done" (or a matching description): change `- [ ]` to `- [x]` and append
  `· done <today>`. Numbers refer to the most recent listing; re-list if unsure.
- "Pick one" or "do #N": treat it as a normal task in this repo. Close the item only
  once the fix is verified, then say so.

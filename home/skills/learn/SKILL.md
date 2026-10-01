---
name: learn
description: Review the skills used in this session and propose, behind numbered approval cards, at most one skill change and one repo-doc note worth keeping, plus outcome log lines. Keeps only knowledge that is not recoverable from code, tests, docs, or skills, recurs or came from a diagnosed failure, and was verified. On request, also promotes a learned skill to the bootstrap repo or prunes learned skills. Use on /learn or $learn, or when the user says "learn from this session", "is anything worth keeping", "save this as a skill", or "improve that skill". User-invoked only.
disable-model-invocation: true
---

# Learn

Turn this session into at most **one skill change** and **one repo-doc note**, each behind a numbered approval card. Nothing is written until the user approves. **"Nothing worth keeping" is the expected, common result.**

## Locations

- Shared skills: `${AGENTS_HOME:-$HOME/.agents}/skills/<name>/` (Codex and pi read it).
- Claude mirror: `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/<name>/`, only if that home exists.
- Outcome log: `${AGENTS_HOME:-$HOME/.agents}/state/learn-outcomes.log`.
- Archive: `${AGENTS_HOME:-$HOME/.agents}/skills-archive/<name>/`.
- Bootstrap repo: the `repository` value in `bootstrap-source.json` in any harness home (`~/.agents`, `~/.codex`, `~/.claude`, `~/.pi/agent`).
- `AGENTS_HOME` set to a custom path: warn that Codex and pi may still read `~/.agents`.

## 1. Review used skills

- List each skill loaded this session. If you can't tell what loaded, record `unknown`; don't guess.
- Rate each **helpful / harmful / neutral / unknown** with one piece of evidence: a user correction, a failing or passing check, a step that was skipped or wrong.
- Propose one outcome log line per skill as `date skill outcome evidence`:

  ```
  YYYY-MM-DD feature-map helpful status flagged two stale features before the edit
  ```

  Evidence is at most 120 chars, with no code, secrets, or confidential detail.
- Harmful with a clear cause → a patch card for that skill. It is the session's one skill change.

## 2. Capture gate

Propose a finding only if **all three** hold:

- Not recoverable from the code, tests, docs, or existing skills.
- Recurs, or is a diagnosed failure.
- Verified by tests or by the user.

Nothing passes → report "nothing worth keeping" with the proposed log lines, and stop.

Route what passes:

- **Repo-specific** → that repo's `AGENTS.md` or its feature map (the `feature-map` skill).
- **Cross-repo procedure** → a skill.
- **Personal preference** → the harness's memory, not a skill.

For a skill, take the first operation that fits:

1. Patch a skill used this session.
2. Extend an existing skill.
3. Add a `references/` file to an existing skill.
4. Create a new family-level skill.
5. **None**: the default when unsure.

Employer repo: generalize anything bound for a cross-repo skill. Confidential specifics stay in that repo's docs or are dropped.

## 3. Cap

- Count local learned skills: `metadata.origin: learned` under the shared skills dir and absent from `home/skills` in the bootstrap repo.
- More than 10 → one prune card naming the weakest (unused, harmful, or superseded), with evidence from the outcome log.

## Approval cards

Number every proposed write, log lines included:

```markdown
#N <short title>
Finding: what was learned, in one line
Change: full file if new, otherwise a diff
Why: evidence (failure, correction, test run)
Where: every path written: skill files, log lines, Claude mirror, installer runs
Risk: what could break; "local to this machine" for a learned skill
```

- Write only on "approve N" or "approve all".
- Any change to a card after approval needs re-approval.

## Write rules

- Read the target before writing.
- Apply find/replace deltas; never rewrite a whole file.
- Fix wrong text in place instead of appending a correction.
- Flag any edit that shrinks a file by more than 30%.
- Family-level names (`api-pagination`, not `fix-1234`); no ticket or PR ids.
- New skill frontmatter: `name` (equal to the directory name), `description`, and `metadata:` with only `origin: "learned"`.
- Before creating a skill, check the name against the shared skills dir, the Claude skills dir, and `home/skills` in the bootstrap repo.

## Where writes go

- **Learned skill**: write to `${AGENTS_HOME:-$HOME/.agents}/skills/<name>/`, then copy it to the Claude mirror. Re-mirror after every write. The card says "local to this machine".
- **Repo skill** (one under `home/skills/<name>` in the bootstrap repo): patch it there, then run `node scripts/install.mjs` from the bootstrap repo. The card warns that `sync` is blocked until the change is committed and offers `agent-environment-sync` to publish it.
- **Repo-doc note**: edit that repo's `AGENTS.md` or feature file. Never commit unless asked.
- **Log lines**: append to the outcome log; create `state/` if missing.

## Promote (on request)

1. Run `skill-inspector` on the skill.
2. Show its full content and do a confidentiality pass: no secrets, machine paths, or employer or customer specifics.
3. Preview, then push once approved:

   ```sh
   node "${AGENTS_HOME:-$HOME/.agents}/tools/agents.mjs" push <full skill path> --dry-run
   ```

   Commit or push to Git only when asked (`agent-environment-sync`).
4. A/B comparison only with permission: via `skill-creator` if installed, else a with/without subagent pair on the same task, else skip it and say so.

## Prune (approved card)

- Move each skill to `${AGENTS_HOME:-$HOME/.agents}/skills-archive/<name>/`.
- Remove its installed copies (the Claude mirror and any other harness copy). The card lists each one.

## Safety

- Never copy untrusted web or repo text into a skill without showing it on the card.
- Cross-repo skills carry no secrets, credential headers, machine paths, or employer or customer specifics.
- Never run unprompted, from a hook, or in the background.

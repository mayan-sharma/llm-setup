---
name: stale-branch-loop
description: Audit local and remote Git branches that appear unused, especially branches not updated for more than a configurable age such as 30 days. Use when the user asks to track stale, unused, abandoned, old, inactive, or cleanup-candidate branches, summarize what each branch contains, compare branches to a base branch, or produce a concise branch hygiene report for any repository.
---

# Stale Branch Loop

Audit Git branches for inactivity and summarize what stale branches contain. Default to a
read-only analysis; do not delete, prune, merge, or modify branches unless the user explicitly asks.

Use `scripts/stale_branch_audit.py` for the first pass whenever possible, then inspect branches
manually where the summary needs better judgment.

## Inputs

- Target: default to the current Git repository.
- Branch source: default to remote branches, excluding symbolic refs such as `origin/HEAD`.
- Age threshold: default to 30 days since the branch tip commit.
- Base branch: infer from `origin/HEAD`, then `main`, then `master`; honor a user-specified base.
- Fetching: ask before network fetches unless the user already requested latest remote state.
- Output: concise Markdown report unless the user asks for JSON or files.

## Workflow

1. Confirm the target directory is a Git worktree.
2. Inspect remotes and default branch:
   - Prefer `git symbolic-ref refs/remotes/origin/HEAD` when available.
   - Fall back to `main` or `master`.
3. Run the helper script from this skill directory:

```bash
python3 <skill-dir>/scripts/stale_branch_audit.py --repo <repo> --days 30 --base <base>
```

Use `--include-local` when the user wants local branches included. Use `--limit N` to keep very
large repositories readable.

4. For each stale branch, review the script output:
   - tip commit subject and author date;
   - ahead/behind counts relative to the base;
   - changed files from the merge base;
   - recent commit subjects;
   - likely status labels.
5. Improve summaries by inspecting branch-specific diffs when needed:

```bash
git log --oneline --decorate --max-count=10 <base>..<branch>
git diff --stat <base>...<branch>
git diff --name-status <base>...<branch>
```

6. Flag branches that are merged into base separately from branches with unmerged work.
7. Produce a concise report with cleanup candidates first and unclear branches last.

## Report Shape

Prefer clean pointers over long tables. Include:

- repository and base branch;
- stale threshold and whether remote state was fetched;
- total branches scanned and stale branch count;
- highest-confidence cleanup candidates;
- branches with unmerged work worth owner review;
- branches needing manual follow-up because the base comparison is ambiguous.

Use this per-branch format:

```markdown
- `<branch>` - last updated <date>, <ahead>/<behind> vs `<base>`.
  Summary: <one sentence about what the branch appears to contain>.
  Signal: <merged | unmerged work | diverged | no unique commits | needs review>.
  Pointers: <2-4 changed files or commit subjects>.
```

## Interpretation Rules

- Treat "not updated in 30+ days" as stale, not automatically safe to delete.
- A branch merged into the base is usually a cleanup candidate.
- A branch with zero commits ahead of base is usually a cleanup candidate even if its tip is old.
- A branch with commits ahead of base needs owner review unless the diff is clearly obsolete,
  generated-only, or superseded by later commits on base.
- A branch far behind base with a small ahead count is likely abandoned, but still summarize the
  unique work before recommending action.
- Do not infer ownership from branch names alone; use commit authors only as a clue.
- Keep branch names exact and quote unusual names in commands.

## Stop

Stop successfully when the report identifies stale branches, summarizes what each material branch
contains, and separates cleanup candidates from review-needed branches.

Stop partially if the repo has no remotes, base inference fails, or branch metadata is unavailable;
report the limitation and provide the best local analysis.

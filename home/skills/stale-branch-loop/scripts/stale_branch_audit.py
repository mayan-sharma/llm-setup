#!/usr/bin/env python3
"""Read-only Git stale branch audit helper."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Branch:
    name: str
    ref: str
    kind: str
    iso_date: str
    epoch: int
    subject: str
    author: str


def run_git(repo: Path, args: list[str], check: bool = True) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit stale Git branches without modifying the repo.")
    parser.add_argument("--repo", default=".", help="Git repository path.")
    parser.add_argument("--days", type=int, default=30, help="Stale threshold in days.")
    parser.add_argument("--base", help="Base branch or ref. Defaults to origin/HEAD, main, then master.")
    parser.add_argument("--include-local", action="store_true", help="Include local branches.")
    parser.add_argument("--remote", default="origin", help="Remote name for remote branch scanning.")
    parser.add_argument("--limit", type=int, default=80, help="Maximum stale branches to detail.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    return parser.parse_args()


def ensure_repo(repo: Path) -> Path:
    root = run_git(repo, ["rev-parse", "--show-toplevel"])
    return Path(root)


def infer_base(repo: Path) -> str:
    origin_head = run_git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], check=False)
    if origin_head:
        return origin_head
    refs = set(run_git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"]).splitlines())
    for candidate in ("origin/main", "origin/master", "main", "master"):
        if candidate in refs:
            return candidate
    raise RuntimeError("Could not infer a base branch. Pass --base explicitly.")


def collect_branches(repo: Path, include_local: bool, remote: str) -> list[Branch]:
    patterns = [f"refs/remotes/{remote}"]
    if include_local:
        patterns.append("refs/heads")

    fmt = "%(refname:short)%00%(refname)%00%(committerdate:iso-strict)%00%(committerdate:unix)%00%(subject)%00%(authorname)"
    rows = run_git(repo, ["for-each-ref", f"--format={fmt}", "--sort=committerdate", *patterns])
    branches: list[Branch] = []
    for row in rows.splitlines():
        if not row:
            continue
        name, ref, iso_date, epoch, subject, author = row.split("\0", 5)
        if name.endswith("/HEAD"):
            continue
        kind = "local" if ref.startswith("refs/heads/") else "remote"
        branches.append(Branch(name, ref, kind, iso_date, int(epoch), subject, author))
    return branches


def ahead_behind(repo: Path, base: str, branch: str) -> tuple[int | None, int | None]:
    out = run_git(repo, ["rev-list", "--left-right", "--count", f"{base}...{branch}"], check=False)
    if not out:
        return None, None
    try:
        behind, ahead = out.split()
        return int(ahead), int(behind)
    except ValueError:
        return None, None


def merged_status(repo: Path, base: str, branch: str) -> bool | None:
    proc = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", branch, base],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode == 0:
        return True
    if proc.returncode == 1:
        return False
    return None


def recent_commits(repo: Path, base: str, branch: str, count: int = 5) -> list[str]:
    out = run_git(repo, ["log", "--format=%h %s", f"--max-count={count}", f"{base}..{branch}"], check=False)
    return [line for line in out.splitlines() if line]


def changed_files(repo: Path, base: str, branch: str, count: int = 8) -> list[str]:
    out = run_git(repo, ["diff", "--name-only", f"{base}...{branch}"], check=False)
    return [line for line in out.splitlines()[:count] if line]


def summarize_signal(ahead: int | None, merged: bool | None) -> str:
    if merged is True:
        return "merged cleanup candidate"
    if ahead == 0:
        return "no unique commits"
    if ahead is None:
        return "needs review"
    return "unmerged work"


def build_report(repo: Path, base: str, days: int, branches: list[Branch], limit: int) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=days)
    stale_branches = []
    for branch in branches:
        branch_dt = dt.datetime.fromtimestamp(branch.epoch, dt.timezone.utc)
        if branch_dt > cutoff:
            continue
        stale_branches.append((branch, branch_dt))

    stale_branches.sort(key=lambda item: item[0].epoch)

    stale = []
    for branch, branch_dt in stale_branches[:limit]:
        ahead, behind = ahead_behind(repo, base, branch.name)
        merged = merged_status(repo, base, branch.name)
        commits = recent_commits(repo, base, branch.name)
        files = changed_files(repo, base, branch.name)
        stale.append(
            {
                "name": branch.name,
                "kind": branch.kind,
                "last_updated": branch.iso_date,
                "age_days": (now - branch_dt).days,
                "tip_subject": branch.subject,
                "tip_author": branch.author,
                "ahead": ahead,
                "behind": behind,
                "merged": merged,
                "signal": summarize_signal(ahead, merged),
                "recent_unique_commits": commits,
                "changed_files": files,
            }
        )

    stale.sort(key=lambda item: (item["signal"] != "merged cleanup candidate", -item["age_days"]))
    return {
        "repo": str(repo),
        "base": base,
        "threshold_days": days,
        "branches_scanned": len(branches),
        "stale_count": len(stale_branches),
        "stale_branches": stale,
        "limited": len(stale_branches) > limit,
    }


def fmt_count(value: int | None) -> str:
    return "?" if value is None else str(value)


def emit_markdown(report: dict) -> str:
    lines = [
        "# Stale Branch Audit",
        "",
        f"- Repository: `{report['repo']}`",
        f"- Base: `{report['base']}`",
        f"- Threshold: {report['threshold_days']} days",
        f"- Branches scanned: {report['branches_scanned']}",
        f"- Stale branches: {report['stale_count']}",
        "",
    ]
    if not report["stale_branches"]:
        lines.append("No stale branches found for this threshold.")
        return "\n".join(lines)

    current_signal = None
    for branch in report["stale_branches"]:
        if branch["signal"] != current_signal:
            current_signal = branch["signal"]
            lines.extend(["", f"## {current_signal.title()}", ""])
        pointers = branch["changed_files"] or branch["recent_unique_commits"] or [branch["tip_subject"]]
        pointer_text = "; ".join(pointers[:4])
        lines.extend(
            [
                f"- `{branch['name']}` - last updated {branch['last_updated']} ({branch['age_days']} days ago), "
                f"{fmt_count(branch['ahead'])} ahead/{fmt_count(branch['behind'])} behind vs `{report['base']}`.",
                f"  Summary: tip is `{branch['tip_subject']}` by {branch['tip_author']}.",
                f"  Pointers: {pointer_text or 'No diff pointers available.'}",
            ]
        )
    if report["limited"]:
        lines.extend(["", f"Output limited; rerun with a larger `--limit` for all {report['stale_count']} branches."])
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    try:
        repo = ensure_repo(Path(args.repo).resolve())
        base = args.base or infer_base(repo)
        branches = collect_branches(repo, args.include_local, args.remote)
        report = build_report(repo, base, args.days, branches, args.limit)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(emit_markdown(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

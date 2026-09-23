---
name: implementation-loop
description: Plan, critique, and finalize a non-trivial software change, then stop for approval; implement only after the user says "approved", using Opus subagents. Drafts a plan from repo and research context, runs it past a minimalism critic (ponytail) and an independent correctness critic, puts open decisions to the user as a grilling round, and folds everything into one final plan before any code is written. Use when the user asks to form a plan and critique it, "critique with ponytail", "plan, critique, finalize", fan out approaches and converge on one, wants an approval-gated implementation, asks to implement a feature, fix, refactor, or architecture change with deep context gathering, says "do what you just did", or invokes /implementation-loop or $implementation-loop.
argument-hint: "[goal]"
---

# Implementation Loop

Plan, critique, finalize, then **stop**. Implementation starts only when the user says "approved", and it runs through Opus subagents.

Honor explicit constraints from the prompt: "do not commit", "no tests", a named branch, a named base.

## 1. Context

- Read the source, docs, config, tests, and prior patterns the goal touches. Use `rg` before slower search.
- Note dirty files; never revert unrelated work.
- If the user names an MCP server, skill, or doc (for Catalyst: the `catalyst` MCP, `packages/catalyst-core/mcp_v2/**`), use it; if it is unreachable, say so in one line and use the nearest local source.
- Research external behavior only when it affects correctness. Turn findings into constraints, not notes.
- Collect facts yourself. Never ask the user for something the repo or tools can answer.

## 2. Plan

Fan out 2-3 approaches (minimal local patch, repo-idiomatic, broader) and converge on one. Draft it in this shape, concise pointers only:

```markdown
## Goal
## Non-goals
## Facts (repo / research)
## Approach (numbered steps, files named)
## Edge cases
## Validation
## Open decisions
```

## 3. Critique

Run two critics in parallel, each with fresh context, given the raw goal, the draft plan, and the relevant file paths:

- **Minimalism critic**: the `ponytail` agent. Ask what can be deleted, reused, or done with stdlib, native features, or existing deps; which steps are speculative.
- **Correctness critic**: a separate general-purpose agent. Ask for blockers, regressions, missing edge cases, repo fit, security or privacy risk, and validation gaps. For a framework or library, include downstream consumers of every public API the plan touches.

Where the harness has no subagents, run each critique as a distinct, labeled self-critique pass instead.

Critics return findings, not rewrites. Discard findings that contradict verified repo facts, and say why in one line.

## 4. Grill

Anything the critics surfaced that is the user's call (API shape, compatibility, scope, rollout, naming) goes to the user as one round, grilling-style:

```
❓ **Q1** - **<title>**: <question, with options>
➡️ <recommended answer>
```

- Ask only real decisions; state low-risk assumptions instead.
- Ask the whole round at once, then wait.
- No open decisions: skip this step.

## 5. Finalize

Fold the critics' accepted findings and the user's answers into one final plan, same shape as step 2. Then report in concise pointers:

- the final plan;
- what each critic changed, one line each;
- what was rejected and why, one line each.

End the reply with: `Reply "approved" to implement.` Then stop.

## 6. Approval gate (always)

- Never implement in the same turn as Finalize, whatever the change size.
- Only an explicit "approved" (or "approve", "go ahead, approved") from the user opens the gate. "Looks good", "ok", or a question does not.
- Feedback instead of approval: revise the plan, re-run the critics if the change is material, re-finalize, and stop again.

## 7. Implement (Opus subagents)

- Hand the approved plan to one or more subagents with `model: "opus"`, never implementing in the main thread. Split into parallel subagents only when steps touch disjoint files.
- Each brief carries: the approved plan verbatim, the step(s) it owns, files it may touch, non-goals, the user's constraints (no commits, no tests, branch), and the checks it must run before reporting.
- The main thread coordinates and reviews: read each subagent's diff, fix or re-dispatch deviations from the plan, then verify.
- In a harness without model selection, use the strongest available model for the subagent and say so in the report.
- Stay inside the final plan and its non-goals. No drive-by refactors.
- Reuse existing helpers and conventions before adding abstractions.
- Leave commits, pushes, and PRs to the user unless they asked.

## 8. Verify

- Run the narrowest checks that prove the change: typecheck, lint, focused tests, build, or a runtime smoke test.
- If the user said no tests, add none, but still run existing checks.
- A blocked check is reported with its exact error and the next-best check that ran.

## 9. Report

Concise pointers:

- what changed, by file;
- checks run and their results;
- skipped work, assumptions, and follow-ups.

## Boundaries

- No code before the user says "approved". No implementation outside Opus subagents.
- Never hide uncertainty behind confident wording.
- No destructive commands; no reverting user changes.
- Prefer primary sources over stale or unofficial ones.

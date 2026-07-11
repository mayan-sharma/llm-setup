---
name: implementation-loop
description: Research, plan, critique, and implement a non-trivial software change from a user goal. Use when the user asks Codex to implement a feature, fix, refactor, or architecture change with deep context gathering; asks to fan out approaches and fan in on one; asks for a research-backed implementation plan or prompt; asks for approval-gated implementation; says "do what you just did"; or explicitly invokes $implementation-loop.
---

# Implementation Loop

## Core Rule

Do not jump straight to code for substantial work. First build enough context to make the
implementation defensible, then converge on one concise approach, get approval when the user asks
for it or the change is high-impact, and only then edit.

Use this skill to turn a broad goal into a concrete, verified implementation. The output before
coding is an implementation prompt/plan: a compact brief that another capable agent or reviewer
could use to execute the work.

## Inputs

- Goal: the feature, fix, refactor, migration, or investigation target.
- Scope: default to the current repository and working tree; honor user-specified paths, branches,
  platforms, or packages.
- Approval mode: default to implementing after a clear plan unless the user requests approval first.
- Test policy: honor explicit constraints such as "do not write tests right now" while still running
  reasonable existing checks when useful.

## Workflow

1. Inspect local context first.
   - Read relevant source, docs, scripts, tests, config, build files, and prior patterns.
   - Use `rg` and `rg --files` before slower search tools.
   - Identify changed or dirty files and avoid reverting unrelated work.
   - Prefer repository facts over assumptions.

2. Use framework or product context when available.
   - If the user names an MCP, skill, plugin, or internal context source, use it when exposed.
   - If a named context source is not callable, say that briefly and use the nearest local source of
     truth.
   - For Catalyst work, prefer `packages/catalyst-core/mcp_v2/**`, source code, and docs over stale
     fallback files unless the user directs otherwise.

3. Research external behavior when it can affect correctness.
   - Browse primary sources, official docs, platform docs, standards, or source repositories for
     current behavior.
   - Use links only when they materially support a decision.
   - Do not pad the plan with research notes; convert research into implementation constraints.

4. Ask clarifying questions when needed.
   - Ask the smallest useful set, normally 1-3 questions.
   - Ask before coding when ambiguity changes the API, data model, privacy/security behavior,
     compatibility, persistence, or migration path.
   - If a question is low-risk, state the assumption and continue.

5. Fan out approaches.
   - Consider at least:
     - the minimal local patch;
     - the idiomatic repo-native implementation;
     - the broader architecture that may be more complete but riskier;
     - platform/library constraints from research.
   - Reject options for concrete reasons: blast radius, testability, lifecycle risk, user API
     complexity, security/privacy, or mismatch with repo patterns.

6. Fan in on one implementation approach.
   - Produce a concise implementation prompt/plan with:
     - goal and non-goals;
     - known facts and assumptions;
     - files/modules likely to change;
     - proposed behavior and lifecycle;
     - edge cases and rollback/cleanup behavior;
     - validation plan;
     - open questions, if any.
   - Keep it short enough for approval and execution. Avoid RFC-sized output unless asked.

7. Critique the plan.
   - Use a separate subagent when available and appropriate. Give it the plan, raw goal, relevant
     files, and ask for a brutal implementation review.
   - If no subagent capability is available, perform a distinct self-critique pass and label it as
     such.
   - Address real issues before asking for approval or coding.

8. Get approval when required.
   - Required when the user explicitly asks for approval, when the plan changes public APIs or
     durable data, or when the implementation could be hard to unwind.
   - Present the final approach in clean steps and ask for approval.
   - If the user gives clarifications, update the plan and proceed according to the newest
     instruction.

9. Implement.
   - Keep edits scoped to the approved approach and existing ownership boundaries.
   - Use existing helpers, conventions, and local abstractions before introducing new ones.
   - Preserve explicit exclusions and non-goals from the plan.
   - Before editing, announce the file area and intended change.

10. Verify.
    - Run focused checks that match the change: syntax, typecheck, unit/integration tests, build,
      platform compile, smoke test, or manual runtime verification.
    - If the user said not to write tests, do not add test files, but still run existing checks when
      useful.
    - If a check is blocked by environment or pre-existing configuration, record the exact blocker
      and use the next-best focused check.

11. Report.
    - Summarize changed behavior and key files.
    - Report validation commands and outcomes.
    - Call out skipped tests, blockers, assumptions, and follow-up work.

## Implementation Prompt Shape

Use this compact shape before coding, adapting section names to the task:

```markdown
## Goal

<One or two sentences.>

## Non-Goals

- ...

## Facts From Repo / Research

- ...

## Approach

1. ...
2. ...
3. ...

## Edge Cases

- ...

## Validation

- ...

## Questions / Assumptions

- ...
```

## Critic Prompt Shape

When using a subagent or doing a separate critique pass, use a prompt like:

```text
Review this implementation plan brutally for correctness, missing edge cases, repo fit,
security/privacy risk, validation gaps, and over-engineering. Do not rewrite the plan unless needed;
return concrete blockers, important risks, and suggested changes.

Goal:
...

Plan:
...

Relevant files/context:
...
```

## Boundaries

- Do not hide uncertainty behind confident wording.
- Do not implement before requested approval.
- Do not use broad rewrites to solve narrow goals.
- Do not add tests when the user explicitly says not to write tests.
- Do not run destructive commands or revert unrelated user changes.
- Do not depend on unofficial or stale external sources when primary docs are available.
- Do not stop after planning when the user expects implementation and approval is not required.

## Final Response

Report:

- what was implemented or, if approval-only, the approved plan;
- important files changed;
- validation performed;
- known limitations or follow-ups.

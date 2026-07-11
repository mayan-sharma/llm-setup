---
name: discussion-loop
description: Research a technical product or architecture topic and produce a clean, concise GitHub Discussion-style proposal with implementation pointers. Use when the user asks to explore an idea, compare approaches, raise a GitHub discussion, draft an engineering discussion, or turn broad research into a decision-oriented discussion post. Prioritize concise pointers over long RFCs.
---

# Discussion Loop

## Core Rule

Produce a **GitHub Discussion draft**, not a bloated RFC.

Do enough discovery and research to avoid shallow recommendations, but compress
the result into clean pointers that a team can discuss. Default to a single
Markdown discussion document unless the user explicitly asks for a full RFC.

## Workflow

1. Inspect the repo first.
   - Identify relevant modules, docs, configs, tests, build scripts, and prior art.
   - Use fast search (`rg`, `rg --files`) and read the concrete implementation before forming conclusions.
   - Separate verified facts from assumptions when it affects the recommendation.

2. Gather external context when needed.
   - Browse for current official docs, primary sources, specs, or source repositories when the topic depends on platform behavior, policies, standards, APIs, security, or recent ecosystem practice.
   - Prefer official docs and primary sources.
   - Do not turn research into a literature review. Keep citations or links only when they materially support a decision.

3. Ask clarifying questions when needed.
   - Ask the smallest useful set, normally 1-3 questions.
   - Ask before fanning out when ambiguity changes the decision frame, audience, success criteria, constraints, security/privacy posture, compatibility expectations, rollout tolerance, or whether the output should be a discussion draft versus an RFC.
   - Do not ask just because more context would be nice. If a question is low-risk, state the assumption and continue.
   - After converging, ask only if the chosen recommendation exposes a sharper decision that cannot be responsibly resolved from repo/research context. Otherwise capture it as a pointed question in the discussion draft's `Discussion Ask`.

4. Fan out mentally before converging.
   - Consider existing repo patterns.
   - Consider a minimal/incremental approach.
   - Consider a more complete architecture.
   - Consider build-vs-buy or open-source patterns when relevant.
   - Keep only the strongest points in the final discussion.

5. Produce a concise discussion draft.
   - Match the user's provided structure when they give one.
   - Otherwise choose a small set of sections that fit the topic and category.
   - Make the decision point clear and ask pointed questions only when they help discussion.
   - Include implementation pointers with file/module-level specificity when available.
   - Avoid exhaustive matrices, long current-state tables, and RFC boilerplate unless asked.

6. Validate the artifact.
   - Run formatting/checks if the output is written into the repo.
   - Critically remove weak, unsupported, or redundant claims.
   - Confirm the final output is concise enough to paste into GitHub Discussions.

## Output Shape

Use the initiating discussion style when the user provides one. If not, choose an adaptive GitHub Discussion shape based on the topic. GitHub positions discussions as open-ended project conversations for ideas, feedback, announcements, Q&A, and decision shaping before work is scoped into issues.

Default to 4-7 short sections, selected from this menu:

~~~markdown
## Context

<Why this topic exists and what repo/product facts matter.>

## Problem

<Current pain, opportunity, or decision pressure.>

## Proposal

<Recommended direction, concise enough for readers to react to.>

## API / UX / Behavior

<Only include when the topic has a user-facing interface, developer API, or visible behavior.>

## Implementation Notes

<Likely files/modules, rollout notes, or technical constraints.>

## Tradeoffs

<Important benefits, costs, risks, or rejected alternatives.>

## Discussion Ask

<Specific feedback or decision requested from the team.>
~~~

Prefer this flow for architecture/product proposals:

~~~markdown
## Idea
## Proposal
## How It Works
## Invalidation / Lifecycle
## Risks and Guardrails
## Discussion Ask
~~~

Prefer this flow for exploratory comparisons:

~~~markdown
## Context
## Options
## Recommendation
## Tradeoffs
## Discussion Ask
~~~

Prefer this flow for lightweight announcements or status-style discussions:

~~~markdown
## Summary
## What Changed
## Impact
## Next Step
~~~

Trim sections aggressively. Do not include empty, generic, or template-looking sections.

## Style Guide

- Use concise bullets and short paragraphs.
- Preserve the user's style when they start with a clear structure.
- Prefer concrete implementation details over research exposition.
- Keep the draft decision-oriented, not documentation-like.
- State the recommended approach plainly when there is one.
- Ask pointed discussion questions only when they are useful for deciding.
- Keep alternatives short: one or two bullets each.
- Avoid long weighted matrices unless the user asks.
- Avoid broad current-state tables.
- Avoid creating a separate supporting plan unless the user asks.
- If the user asks for an RFC, ask whether they want a full RFC or a discussion draft.

## Implementation Detail Expectations

Include:

- likely files/modules to touch, when relevant;
- proposed config/API/UX shape, when relevant;
- lifecycle, rollout, or operational behavior, when relevant;
- security/privacy constraints, when relevant;
- validation or testing strategy, when relevant.

Do not include:

- exhaustive research summaries;
- long citations lists;
- massive decision matrices;
- speculative timelines unless requested;
- production implementation unless the user asks for it.

## Final Response

When done, report:

- the created discussion file path, if any;
- the recommendation in one sentence;
- validation performed;

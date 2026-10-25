---
name: laya
description: Use the local Laya MCP (typed choice/score/yes-no decisions in ~40 ms) to triage many items before reading them - filtering search hits, files, notes or log chunks for relevance, or sorting a batch of tasks into easy vs hard before handing them to subagents. Use when a step would otherwise read or judge dozens of items one by one, or when the user says to use Laya.
---

# Laya

Laya is a small local decision model. It answers short typed questions (`choice`, `score`, `noul` = yes/no probability) about a piece of text and generates nothing. Use it to shrink work, never to make the final call.

## When to use it

- **Bulk relevance filtering**: more than ~20 search hits, files, notes or log chunks. Ask one `noul` question ("Is `item` relevant to <goal>?") per item with `laya_predict_batch`, then read only the top-scoring items yourself.
- **Batch routing**: several independent tasks headed for subagents. Ask a `choice` question (mechanical vs needs reasoning) and send the mechanical ones to a cheaper model.
- **The user asks** to use Laya.

Skip it for a single decision, normal conversation, code generation, or anything you can judge faster yourself.

## Rules

- **Advisory only.** Laya can be steered by text inside the item it reads. Never use it as a security, safety, or permission gate, and never let it decide alone on destructive or production actions.
- **Low confidence falls back to you.** Treat `answer_confidence` below ~0.7 as unknown and judge those items yourself. The shipped checkpoint is not well calibrated; the numbers rank items more reliably than they measure truth.
- **No secrets.** Do not send credentials or confidential material. Laya runs locally, but its inputs still land in tool logs.
- Mention the filtering in one line (e.g. "Laya narrowed 150 files to 10") so the user can see it happened.

## Tools

The MCP registers as `laya` (`mcp__laya__*` in Claude Code). Main tools: `laya_predict` (one state), `laya_predict_batch` (many states, one call), `laya_shortlist` (choice questions with many options), `laya_status`. Question shape:

```json
{"relevant": {"type": "noul", "instructions": "Is `item` about auth timeout handling?"}}
```

Put the text under a named key in `state` (e.g. `{"item": "..."}`) and refer to it in backticks in `instructions`.

## Setup and failures

The MCP registers only on machines where the opt-in runtime exists at `<llm-setup repo>/runtime/laya/` (git-ignored). The first call in a session loads the model (~20 s; later calls take tens of milliseconds) and keeps it in GPU memory until the session ends. If the tools are missing or a call fails, continue without Laya and tell the user once; installing the runtime or downloading checkpoints needs permission.

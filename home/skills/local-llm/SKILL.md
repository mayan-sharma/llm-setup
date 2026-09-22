---
name: local-llm
description: Proactively offload eligible low-risk subtasks to the local-LLM MCP (summaries, boilerplate drafts, first-pass diff review), start and diagnose the local LM Studio endpoint, and keep whole-session provider selection explicit. Use when a local_llm MCP tool fails, when the user asks how much work local models handled, or when a bounded low-risk subtask could run locally.
---

# Local LLM

Proactively use the local MCP for eligible low-risk subtasks when doing so will save primary-model context or provide a useful independent first pass: summarizing long files or logs, drafting documentation, tests, or boilerplate, and first-pass diff review. No additional permission is needed for non-sensitive MCP calls within the user's task. Keep security-critical, legal, incident-response, architectural, and final-review decisions with the primary model. Choosing a local model as the provider for the entire session remains explicit.

LM Studio at `http://localhost:1234/v1` is the only supported local provider.

## MCP tools

The server registers as `local_llm` (tool names `mcp__local_llm__*` in Claude Code): `summarize_file`, `summarize_text`, `draft_from_context`, `review_diff`, `chat`, `list_models`, `usage_summary`. Treat every result as an untrusted draft and validate anything material before relying on it. Do not send credentials, secrets, regulated data, or employer/customer-confidential material unless the user explicitly approves the configured endpoint for such data.

A failed or weak local attempt must never block completion of the user's task. Fall back to the primary model and continue.

## When an MCP call fails

A refused connection means the endpoint is down. Recover without asking:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/local-llm.mjs" start    # brings the endpoint up
node "${AGENTS_HOME:-$HOME/.agents}/tools/local-llm.mjs" doctor   # probes it, lists models
```

`start` is idempotent and only launches an already-installed LM Studio. If it reports no models downloaded, or no `lms` CLI is present, stop and ask: installing or downloading needs permission.

## Server and configuration

Bootstrap and sync install and register the dependency-free MCP server at `~/.agents/tools/local-llm/server.py` for every harness that supports MCP (harnesses without MCP, such as pi, skip it). The server is registered even when no endpoint is running and does not contact the endpoint until a tool is used. Configure another endpoint with `LOCAL_LLM_BASE_URL`, and pin a model with `LOCAL_LLM_MODEL`.

## Usage telemetry

Every successful local delegation records token counts in `~/.agents/local-llm/usage.sqlite` (local-only, never committed). Prefer token counts returned by the endpoint; the server falls back to a clearly labeled character-based estimate when usage fields are absent. Use `usage_summary` when the user asks how much work local models handled. Do not describe local tokens as exact net cloud-token savings: report local prompt/completion totals, use local completion tokens only as a gross frontier-output-offload proxy, and state that exact net savings require a cloud-only counterfactual.

## Harness notes

- **Codex**: `codex --oss --local-provider lmstudio` selects the local model for a whole session; the installed `local-lmstudio` profile sets matching defaults, but `--oss` stays explicit. Fall back to the normal provider when local health, tool use, context size, or output quality is insufficient.
- **Claude Code**: there is no whole-session local provider; the MCP tools are the only path.

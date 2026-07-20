---
name: local-llm
description: Proactively offload eligible low-risk subtasks to the local-LLM MCP, start and diagnose the local LM Studio endpoint, and keep whole-session provider selection explicit.
---

# Local LLM

Proactively use the local MCP for eligible low-risk subtasks when doing so will save primary-model context or provide a useful independent first pass — summarizing long files or logs, drafting documentation/tests/boilerplate, and first-pass diff review. No additional permission is needed for non-sensitive MCP calls within the user's task. Keep security-critical, legal, incident-response, architectural, and final-review decisions with the primary model. Choosing a local model as the provider for the entire session remains explicit.

LM Studio at `http://localhost:1234/v1` is the only supported local provider, for both the MCP tools and Codex `--oss`.

## When an MCP call fails

A refused connection means the endpoint is down. Recover without asking:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/local-llm.mjs" start    # brings the endpoint up
node "${AGENTS_HOME:-$HOME/.agents}/tools/local-llm.mjs" doctor   # probes it, lists models
```

`start` is idempotent and only launches an already-installed LM Studio. If it reports no models downloaded, or no `lms` CLI is present, stop and ask — installing or downloading needs permission.

## Whole-session Codex provider

```sh
codex --oss --local-provider lmstudio
```

The installed `local-lmstudio` profile sets matching defaults, but `--oss` remains explicit. Fall back to the normal Codex provider when local health, tool use, context size, or output quality is insufficient. A failed or weak MCP attempt must not block completion of the user's task.

## Local MCP server

Bootstrap and sync install and register the dependency-free MCP server at `~/.agents/tools/local-llm/server.py` automatically (for every harness that supports MCP; harnesses without MCP, such as pi, simply skip it). It supports low-risk drafting, summaries, and first-pass diff review against an OpenAI-compatible endpoint. Treat its output as an untrusted draft and validate anything material before relying on it. Do not send credentials, secrets, regulated data, or employer/customer-confidential material unless the user explicitly approves the configured endpoint for such data.

The default endpoint is LM Studio at `http://localhost:1234/v1`; the server is registered even when no endpoint is running, but it does not contact the endpoint until a tool is used. Configure another endpoint with `LOCAL_LLM_BASE_URL`, and pin a model with `LOCAL_LLM_MODEL`. Usage metadata is local-only in `~/.agents/local-llm/usage.sqlite` and must never be committed.

Every successful local delegation records token telemetry automatically. Prefer token counts returned by the local OpenAI-compatible endpoint; the server falls back to a clearly labeled character-based estimate when usage fields are absent. Use the `usage_summary` tool when the user asks how much work local models handled or how many tokens were offloaded. Do not describe local tokens as exact net cloud-token savings: report local prompt/completion totals, use local completion tokens only as a gross frontier-output-offload proxy, and state that exact net savings require a cloud-only counterfactual.

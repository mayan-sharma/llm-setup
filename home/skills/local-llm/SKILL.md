---
name: local-llm
description: Proactively offload eligible low-risk subtasks to the local-LLM MCP, diagnose optional Ollama or LM Studio endpoints, and keep whole-session provider selection explicit.
---

# Local LLM

Proactively use the local MCP for eligible low-risk subtasks under the global policy when doing so will save primary-model context or provide a useful independent first pass. Choosing a local model as the provider for the entire Codex session remains explicit.

Run `node ~/.codex/bootstrap-tools/local-llm.mjs doctor` to check supported local endpoints and list discovered models. Never start, download, or remove a model without the user's permission.

Preferred Codex commands:

```sh
codex --oss --local-provider ollama
codex --oss --local-provider lmstudio
```

The installed `local-ollama` and `local-lmstudio` profiles set matching defaults, but `--oss` remains explicit. Fall back to the normal Codex provider when local health, tool use, context size, or output quality is insufficient. A failed or weak MCP attempt must not block completion of the user's task.

## Local MCP server

Bootstrap and sync install and register the dependency-free MCP server at `~/.codex/local-llm/server.py` automatically. It supports low-risk drafting, summaries, and first-pass diff review against an OpenAI-compatible endpoint. Treat its output as an untrusted draft and validate anything material before relying on it. Do not send credentials, secrets, regulated data, or employer/customer-confidential material unless the user explicitly approves the configured endpoint for such data.

The default endpoint is LM Studio at `http://localhost:1234/v1`; the server is registered even when no endpoint is running, but it does not contact the endpoint until a tool is used. Configure another endpoint with `LOCAL_LLM_BASE_URL`, and pin a model with `LOCAL_LLM_MODEL`. Usage metadata is local-only in `~/.codex/local-llm/usage.sqlite` and must never be committed.

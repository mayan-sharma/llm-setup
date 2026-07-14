---
name: local-llm
description: Diagnose and use optional Ollama or LM Studio local model endpoints with Codex while keeping provider selection explicit.
---

# Local LLM

Use only when the user requests a local model or accepts its capability and privacy tradeoffs.

Run `node ~/.codex/bootstrap-tools/local-llm.mjs doctor` to check supported local endpoints and list discovered models. Never start, download, or remove a model without the user's permission.

Preferred Codex commands:

```sh
codex --oss --local-provider ollama
codex --oss --local-provider lmstudio
```

The installed `local-ollama` and `local-lmstudio` profiles set matching defaults, but `--oss` remains explicit. Fall back to the normal Codex provider when local health, tool use, context size, or output quality is insufficient.

## Local MCP server

Bootstrap and sync install and register the dependency-free MCP server at `~/.codex/local-llm/server.py` automatically. It supports low-risk drafting, summaries, and first-pass diff review against an OpenAI-compatible local endpoint. The default endpoint is LM Studio at `http://localhost:1234/v1`; the server is registered even when no endpoint is running, but it does not contact the endpoint until a tool is used. Configure another endpoint with `LOCAL_LLM_BASE_URL`, and pin a model with `LOCAL_LLM_MODEL`. Usage metadata is local-only in `~/.codex/local-llm/usage.sqlite` and must never be committed.

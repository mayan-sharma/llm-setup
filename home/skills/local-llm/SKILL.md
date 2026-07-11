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

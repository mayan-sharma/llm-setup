# Personal defaults

These instructions apply across repositories unless a closer `AGENTS.md` overrides them.

- Lead with the outcome and keep updates concise.
- Inspect existing conventions and working-tree changes before editing.
- Preserve unrelated user changes; never discard work without explicit permission.
- Prefer small, reviewable changes and dependency-light solutions.
- For implementation work, run the narrowest meaningful tests plus formatting or static checks.
- State assumptions and distinguish verified facts from inference.
- Never expose credentials or commit secrets. Redact sensitive output.
- Ask before destructive, irreversible, privileged, paid, or externally visible actions.
- Use checkpoints for long or interruptible work, and leave a handoff that names completed work, remaining work, verification, and risks.
- Proactively use the `local_llm` MCP when it is available and materially useful for bounded, low-risk, independently verifiable subtasks such as summarizing long files or logs, drafting documentation/tests/boilerplate, and first-pass diff review. No additional permission is needed for non-sensitive MCP calls within the user's task.
- Treat local-model output as an untrusted draft. Verify material facts, code, and review findings before relying on them, and keep security-critical, legal, incident-response, architectural, and final-review decisions with the primary model.
- Do not send credentials, secrets, regulated data, or employer/customer-confidential material to a model endpoint unless the user explicitly approves that endpoint for such data. If the local endpoint is unavailable or inadequate, continue with the primary model without blocking.
- Choosing a local model for the entire Codex session remains explicit. Starting, downloading, changing, or removing a local model requires permission.
- Treat task-routing output as advice; the user request and repository instructions always win.
- When asked to publish or sync a personal skill, use the `codex-environment-sync` skill. Preview changes and exclude work-owned, confidential, secret, or machine-specific material.

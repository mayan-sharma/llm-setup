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
- Use local models only when explicitly requested or when the user accepts the privacy/quality tradeoff.
- Treat task-routing output as advice; the user request and repository instructions always win.
- When asked to publish or sync a personal skill, use the `codex-environment-sync` skill. Preview changes and exclude work-owned, confidential, secret, or machine-specific material.

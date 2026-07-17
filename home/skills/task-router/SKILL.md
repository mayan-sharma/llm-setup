---
name: task-router
description: Recommend an optional execution lane for a task based on privacy, complexity, and repository risk without launching work.
---

# Task router

Use when the user asks where a task should run or explicitly asks for routing. Run:

```sh
node "${AGENTS_HOME:-$HOME/.agents}/tools/route-task.mjs" "task description"
```

Treat the result as a heuristic. Explain the recommendation and let explicit user instructions, repository policy, data sensitivity, and available capabilities override it. The helper never invokes a model or transmits the task.

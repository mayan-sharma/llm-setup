---
name: feature-map
description: Build, refresh, and use a feature map for an application repository - one short file per user-facing feature recording its user flow, entry points, how it works, invariants, and how to exercise it, kept fresh from git diffs. Use when the user asks to map features, build or update a feature map, document how the app works or its user flows, give agents feature context, onboard to an unfamiliar codebase, or check whether the map is stale; when a repo already has `.agents/feature-map/` and a task touches a mapped feature; or on /feature-map or $feature-map.
argument-hint: "[build | update | status | <feature or question>]"
---

# Feature Map

A feature map is what the app does, from the user's point of view down to the code, so an
agent can start work from the map instead of rediscovering the app each time. It lives in the
**app repository** at `.agents/feature-map/` and is committed with the code.

```
.agents/feature-map/
  README.md        # index: mapped_at SHA, ignore globs, feature table
  <feature>.md     # one file per feature
```

Modes, from the argument or the situation:

- **status**: run the helper and report what is stale.
- **build**: there is no map yet. Map the whole app.
- **update**: a map exists. Refresh only what changed since `mapped_at`.
- **use** (any other argument, or implicitly before a task): read the index, then only the
  features the task touches.

## Helper

```bash
node <skill-dir>/scripts/feature_map.mjs status [--repo <app>] [--map .agents/feature-map] [--json]
```

It compares `mapped_at` against the working tree, including uncommitted and untracked files,
and reports:

- **Stale features**: a changed file matches the feature's `paths`.
- **Unmapped changes**: changed files no feature claims. Either a new feature or a missing path.
- **Dead paths**: globs that match no tracked file, usually renames.
- **Features without paths**: these can never go stale, so fix them.

`mapped_at` is missing or unknown: freshness can't be determined, so re-verify every feature.

## Build

1. Confirm the target is a git repo and note dirty files. Never commit unless asked.
2. **Inventory features from the code, not from docs**: routes and pages, API handlers, CLI
   commands, jobs and queues, webhooks, settings, permissions. README and docs are hints to
   verify, not sources.
3. **Choose the granularity a user or PM would name**: "checkout", "invite teammate", "export
   CSV". Not "utils" or "database". Aim for 5-40 features. Put shared plumbing (auth, data
   layer, background jobs) in one `platform-<area>.md` each.
4. For a large app, split the inventory across subagents by area, each writing its own feature
   files. Where the harness has no subagents, work area by area.
5. Write each feature file from the template below. **Trace the flow end to end** (UI, then API,
   then service, then storage, then side effects) before writing.
6. **Exercise it**: record the cheapest reliable way to run the feature: a repo debug CLI
   command, a focused test, a curl call, or manual steps. Run it when that's safe and local;
   otherwise mark it `(unverified)`.
7. Write `README.md` with `mapped_at` set to `git rev-parse HEAD`. Add an `ignore` list for noise
   such as lockfiles and generated code.
8. Run the helper. Every feature should be fresh with no dead paths, and unmapped changes
   limited to the map itself. Fix whatever isn't.

## Update

1. Run the helper.
2. For each **stale** feature, read its file and the diff for the changed paths
   (`git diff <mapped_at> -- <paths>`). Rewrite only the lines the code change made false.
3. For each **unmapped** file, add it to an existing feature's `paths`, or create a new feature
   file.
4. Fix **dead paths** (find where the code moved) and delete features that were removed.
5. Bump `mapped_at` to `HEAD` only once every stale feature is resolved. Re-run the helper to
   confirm.

## Use

- Before changing an app with a map, read `README.md`, pick the features the task touches, and
  read only those files plus their `related` ones.
- **Treat the map as a lead, not a fact**: check any claim that your change depends on against
  the code.
- A change that alters a mapped feature's flow, entry points, invariants, or exercise steps
  updates that feature file **in the same change**. Leave `mapped_at` alone unless you ran a full
  update.

## Templates

`README.md`:

```markdown
---
mapped_at: <full commit SHA>
ignore:
  - "**/*.lock"
  - package-lock.json
---
# Feature map

| Feature | Summary | Entry points |
| --- | --- | --- |
| [checkout](checkout.md) | Cart to paid order | `/checkout`, `POST /api/orders` |
```

`<feature>.md`:

```markdown
---
feature: checkout
summary: Turns a cart into a paid order and sends the receipt.
paths:
  - src/features/checkout/**
  - api/routes/orders.ts
related: [cart, payments]
---
# Checkout

## User flow
1. User opens `/checkout` from the cart ...

## Entry points
- UI: `src/features/checkout/CheckoutPage.tsx` (route `/checkout`)
- API: `POST /api/orders` -> `api/routes/orders.ts` `createOrder`

## How it works
- Data, state transitions, external calls, and side effects (events, jobs, emails).

## Invariants
- Rules the code must keep, such as "an order is created only after payment is authorized".

## Exercise it
- `./dev order:create --user demo` or `npm test -- checkout`, or the manual steps. Mark `(unverified)` if not run.

## Gotchas
- Non-obvious traps, flags, and known bugs.
```

## Rules

- **Cite `path` plus symbol, never line numbers.** Lines drift; symbols can be searched.
- One screen per feature. Link to code rather than paraphrasing it.
- Write only what you verified in code. Label inference as `(inferred)`.
- **Never record secrets**, env values, customer data, or internal URLs that aren't already in
  the repo.
- `paths` must be specific enough that unrelated changes don't mark the feature stale.
- Keep the map in the app repo. Never publish it through the personal environment repo.

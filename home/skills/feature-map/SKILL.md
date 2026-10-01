---
name: feature-map
description: Build, refresh, and use a feature map for an application or framework repository - one short file per user-facing feature recording its user flow, entry points, how it works, invariants, and how to exercise it, kept fresh from git diffs. Use when the user asks to map features, build or update a feature map, document how the app works or its user flows, give agents feature context, onboard to an unfamiliar codebase, or check whether the map is stale; when a repo already has `.agents/feature-map/` and a task touches a mapped feature; or on /feature-map or $feature-map.
argument-hint: "[build | update | status | <feature or question>]"
---

# Feature Map

A feature map is what the app does, from the user's point of view down to the code, so an
agent can start work from the map instead of rediscovering the app each time. It lives in the
**app repository** at `.agents/feature-map/` and is normally committed with the code.

```
.agents/feature-map/
  README.md        # index: mapped_at SHA, ignore globs, feature table
  <feature>.md     # one file per feature
```

**Local-only maps.** When the user doesn't want the map committed, keep it at the same path and
add `/.agents/` to `.git/info/exclude` (local, never pushed), or keep it outside the repo and pass
`--map <dir>`. Everything else works the same. Say that teammates and CI won't see it and that
it isn't backed up.

Modes, from the argument or the situation:

- **status**: run the helper and report what is stale.
- **build**: there is no map yet. Map the whole app.
- **update**: a map exists. Refresh only what changed.
- **use** (any other argument, or implicitly before a task): read the index, then only the
  features the task touches.

## Helper

```bash
node <skill-dir>/scripts/feature_map.mjs status   [--repo <app>] [--map .agents/feature-map] [--json] [--strict]
node <skill-dir>/scripts/feature_map.mjs coverage [--repo <app>] [--map .agents/feature-map] [--json] [--strict]
```

`status` diffs each feature against its base, the newer of its own `verified_at` and the index
`mapped_at`, including uncommitted and untracked files, and reports:

- **Stale features**: a changed file matches the feature's `paths`.
- **Unmapped changes**: files changed since `mapped_at` that no feature claims. Either a new
  feature or a missing path.
- **Dead paths**: globs that match no tracked file, usually renames.
- **Features without paths**: these can never go stale, so fix them.
- `mapped_at` missing, unknown, or not an ancestor of `HEAD` (rebase, squash, other branch):
  freshness can't be trusted, so re-verify and reset it.

`coverage` checks the whole repo, not just changes: tracked files no feature claims, files
several features share, missing template sections, `related` names that aren't features, and
frontmatter lines the parser couldn't read.

`--strict` exits 1 when the report has anything to fix, for CI or hooks.

Frontmatter is a YAML subset: scalars (plain, quoted, `>`/`|` blocks), `[a, b]` lists, and
`key:` followed by `- item` lines. Globs: `**` spans directories, `*` and `?` stay in one segment,
a plain path matches everything under it, and a `!glob` entry in `paths` excludes files. Matching
is case-sensitive; there is no brace expansion.

## Build

1. Confirm the target is a git repo and note dirty files. Never commit unless asked.
2. **Inventory features from the code, not from docs**: routes and pages, API handlers, CLI
   commands, jobs and queues, webhooks, settings, permissions. README and docs are hints to
   verify, not sources.
3. **Choose the granularity its users would name**: "checkout", "invite teammate", "export CSV".
   Not "utils" or "database". Aim for 5-40 features. Put shared plumbing (auth, data layer,
   background jobs) in one `platform-<area>.md` each. In a framework or library, the users are
   app developers (public APIs, CLI commands, config), end users of the apps it builds (runtime
   behavior), and contributors (build, release, CI, test tooling). Each counts as a feature
   source, and each User flow says whose flow it is.
4. For a large app, split the inventory across subagents by area, each writing its own feature
   files. Give each subagent the full feature list for `related`, and tell it that shared files
   are claimed by every feature whose flow runs through them. Where the harness has no
   subagents, work area by area.
5. Write each feature file from the template below. **Trace the flow end to end** (UI, then API,
   then service, then storage, then side effects) before writing.
6. **Exercise it**: record the cheapest reliable way to run the feature: a repo debug CLI
   command, a focused test, a curl call, or manual steps. Run it when that's safe and local, and
   mark it `(verified)` only with the exact command someone can rerun. Otherwise mark it
   `(unverified)`. Never cite a one-off script or a date.
7. Write `README.md` with `mapped_at` set to `git rev-parse HEAD`. Add an `ignore` list for noise
   such as lockfiles, generated code, and prose-only docs. Don't ignore example or fixture apps
   that a feature's Exercise it depends on; claim them from that feature.
8. Run `status` and `coverage`. Every feature should be fresh, with no dead paths, no unclaimed
   files, and no lint. Fix whatever isn't.

## Update

1. Run `status`.
2. For each **stale** feature, read its file and the diff for the changed paths
   (`git diff <base> -- <paths>`). Rewrite only the lines the code change made false, and delete
   Suspected bugs entries the change fixed.
3. For each **unmapped** file, add it to an existing feature's `paths`, or create a new feature
   file.
4. Fix **dead paths** (find where the code moved) and delete features that were removed.
5. Bump `mapped_at` to `HEAD` only once every stale feature is resolved, and drop the per-feature
   `verified_at` values it supersedes. Re-run `status` and `coverage` to confirm.

## Use

- Before changing an app with a map, read `README.md`, pick the features the task touches, and
  read only those files plus their `related` ones.
- **Treat the map as a lead, not a fact**: check any claim that your change depends on against
  the code.
- A change that alters a mapped feature's flow, entry points, invariants, or exercise steps
  updates that feature file **in the same change**, and sets that file's `verified_at` to the
  commit the edit describes, so `status` stops flagging it. Leave the index `mapped_at` alone
  unless you ran a full update.

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
  - api/lib/payments.ts        # shared with payments; claim it from both
related: [cart, payments]
verified_at: <optional SHA, set when this file was re-verified after mapped_at>
---
# Checkout

## User flow
1. Shopper opens `/checkout` from the cart ...

## Entry points
- UI: `src/features/checkout/CheckoutPage.tsx` (route `/checkout`)
- API: `POST /api/orders` -> `api/routes/orders.ts` `createOrder`

## How it works
- Data, state transitions, external calls, and side effects (events, jobs, emails).

## Invariants
- Rules the code must keep, such as "an order is created only after payment is authorized".

## Exercise it
- `npm test -- checkout` (verified), or the manual steps (unverified).

## Gotchas
- Traps that change how you write code here: payload shapes, ordering, flags, platform differences.

## Suspected bugs
- Optional. Defects noticed while mapping, one line each with the symbol and how to see it,
  labelled (verified) or (inferred), or a link to the issue. Delete an entry once it's fixed.
```

## Rules

- **Cite `path` plus symbol, never line numbers.** Lines drift; symbols can be searched.
- One screen per feature. Link to code rather than paraphrasing it.
- Write only what you verified in code. Label inference as `(inferred)`.
- **Never record secrets**, env values, customer data, or internal URLs that aren't already in
  the repo.
- `paths` must be specific enough that unrelated changes don't mark the feature stale, and
  complete enough that a change to the feature's code does. A dispatcher or handler file that
  implements several features belongs in all of their `paths`.
- **Mapping is not fixing.** Record defects under Suspected bugs; don't change code or file
  issues unless the user asks. Keep Gotchas for traps, not defects or legacy cleanup notes.
- Keep the map in the app repo. Never publish it through the personal environment repo.

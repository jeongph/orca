# Agent Scratch Worktree Visibility

## Problem

\#9535 classified `<repo>/.claude/worktrees/**` and `<repo>/.gsd-workspaces/**` as
`agent-scratch` and suppressed them unconditionally so sub-agent fan-out stops flooding the
sidebar (#9388). The suppression has no opt-out, and it removed every surface that could
explain or undo it.

- `shouldShowWorktree` returns `false` for `agent-scratch` before it consults
  `externalWorktreeVisibility`, so setting a repo to `show` has no effect on these worktrees.
- Every recovery surface funnels through `isUserFacingExternalWorktree`, which excludes
  `agent-scratch`. The sidebar row is absent, the `Hiding N discovered worktrees` line never
  renders, the new-external-worktree inbox never offers the path, and the `Non-Orca worktrees`
  dialog reports `0 worktrees currently shown` while the worktree sits on disk.
- `importedExternalWorktreePaths` is the only field that overrides the gate, and its only
  writer is the inbox — which excludes `agent-scratch`. No in-app path reveals the worktree.

This is not a hypothetical. Claude Code's `claude -w` / `--worktree` flag creates session
worktrees at `<repo>/.claude/worktrees/<name>`; users who start parallel work there and
continue it in Orca lose the worktree from the sidebar with no way to diagnose or recover.
Observed after upgrading to 1.4.155 from a pre-1.4.148 build: four worktrees across three
repos disappeared, all of them visible on the prior build. Orca still tracks them — it mints
`worktreeMeta` entries with `workspaceStatus: "in-progress"` for paths the UI reports as `0`.

`AGENT_SCRATCH_PATH_PREFIXES` is also a moving target by nature: agent CLIs and their plugins
add and relocate scratch directories on their own schedule, so the list is always somewhat
behind. That cuts both ways — a location the list misses spams the sidebar, and a location it
covers vanishes silently. Curating the list more aggressively cannot resolve that tension on
its own; users need to see what the list decided and be able to override it.

## Goal

Restore user control without reverting #9388.

1. A repo-level opt-in that makes `agent-scratch` worktrees appear in the sidebar. The default
   stays hidden.
2. The `Non-Orca worktrees` dialog accounts for `agent-scratch` worktrees and offers that
   toggle, so "why is my worktree missing" is answerable inside the app.

Invariant: every worktree `git worktree list` reports is either unconditionally visible (the
selected checkout, an explicit import, or `orca-managed`) or counted in exactly one of the four
accessor buckets — `getHiddenExternalWorktrees`, `getVisibleExternalWorktrees`,
`getHiddenAgentScratchWorktrees`, `getVisibleAgentScratchWorktrees` (the dialog itself reads
only one scratch bucket at a time, based on the setting). This catches a worktree being
**dropped** from every bucket; it does not catch a worktree being **misclassified** into the
wrong one.

## Non-goals

- **Changing the default.** Agent scratch stays hidden unless the user opts in. The #9388
  fan-out protection is unchanged.
- **Changing `AGENT_SCRATCH_PATH_PREFIXES`.** No scratch locations are added or removed here.
  Adding one hides worktrees that are visible today, which is the very regression this change
  exists to make recoverable, so it should not ride along with the fix.
- **Per-path selection for agent scratch.** Repo-level is sufficient;
  `importedExternalWorktreePaths` already covers the per-path case for worktrees that reach
  the inbox.
- **Re-attributing agent sessions on pane `cd`.** Agent rows derive from `tabsByWorktree`
  (`useWorktreeAgentRows.ts:47`) and bind at pane creation, so running `claude -w` inside a
  split pane leaves its agent under the original worktree row. That is a different subsystem
  and a separate design question; this change does not address it.

## Design

### Data model

One optional field on `Repo`, beside `externalWorktreeVisibility`:

```ts
/** Controls whether coding-agent scratch worktrees (.claude/worktrees, …) reach the sidebar. */
agentWorktreeVisibility?: ExternalWorktreeVisibility
```

Reuses the existing `'show' | 'hide'` union. Absent means hide, which matches today's
behavior, so no migration and no legacy-repo carve-out — unlike
`externalWorktreeVisibility`, this setting has no pre-rollout meaning to preserve.

Named `agentWorktreeVisibility`, not `agentScratchWorktreeVisibility`, deliberately: it matches
the user-facing "Agent worktrees" copy rather than the `agent-scratch` code vocabulary. That
divergence from the code's naming is intentional, not an oversight — renaming a persisted field
later needs a migration, so the rationale is recorded here.

### Visibility gate

`shouldShowWorktree` (`worktree-ownership.ts:242-244`) trades its unconditional `false` for a
repo lookup:

```ts
if (args.ownership === 'agent-scratch') {
  return args.repo.agentWorktreeVisibility === 'show'
}
```

The earlier selected-checkout (`:227`) and explicit-import (`:234`) branches keep their
precedence. `applyMetadataFallbackVisibility` (`:251-255`) keeps its scratch early-return:
when metadata lookup fails the fallback fails open, and scratch must not flood in on that
path.

### Counting

`isUserFacingExternalWorktree` (`external-worktree-inbox.ts:57-63`) is left alone. It feeds
the sidebar `Hiding N discovered worktrees` line, the discovery card, and the
new-external-worktree inbox; unfiltering it there would reinstate the #9388 spam. Two new
accessors serve the dialog instead:

```ts
export function getHiddenAgentScratchWorktrees(detected): DetectedWorktree[]
export function getVisibleAgentScratchWorktrees(detected): DetectedWorktree[]
```

The pair mirrors the existing `getHiddenExternalWorktrees` / `getVisibleExternalWorktrees`, so
the dialog reads the hidden count while the setting is off and the shown count while it is on.

Only `WorktreeVisibilityDialog` consumes them. The inbox and discovery card are untouched.

### UI

`WorktreeVisibilityDialog` gains a second row below the existing one:

```text
┌─ Non-Orca worktrees ──────────────────────┐
│  pilot                                    │
│  ┌───────────────────────────────────────┐│
│  │ 👁  Shown in sidebar                  ││
│  │    0 worktrees currently shown  [Hide]││
│  └───────────────────────────────────────┘│
│  ┌───────────────────────────────────────┐│
│  │ 🤖  Agent worktrees hidden            ││
│  │    1 in .claude/worktrees/     [Show] ││
│  └───────────────────────────────────────┘│
└───────────────────────────────────────────┘
```

- The subtitle names the parent path group (reusing `getExternalWorktreeParentPath`) so the
  reason for the absence is legible where the fix is — unless the hidden worktrees span more
  than one parent, in which case it reports a location count instead of naming just one of them.
- The row is omitted when the repo has not opted in and has no agent-scratch worktrees.
  Once opted in, the row always renders — including with zero worktrees currently present —
  so the opt-in stays visible and reversible.
- Toggling refreshes via `fetchWorktrees(repoId, { requireAuthoritative: true })` and rolls
  the field back on failure, following `showImportedWorktreesCard`
  (`imported-worktrees-card-actions.ts:47-66`).
- The project-menu item (`WorktreeList.tsx:4577`) is unchanged; the entry point stays put.

## Data Flow

`agentWorktreeVisibility` follows the route `externalWorktreeVisibility` already takes:

```text
WorktreeVisibilityDialog → store/slices/repos.ts → preload/api-types.ts
  → main/ipc/repos.ts → runtime/rpc/methods/repo-update-schema.ts
  → main/runtime/orca-runtime.ts → main/persistence.ts
```

Each hop carries a `Pick<Repo, …>` allowlist that must name the new field, and
`repo-update-schema.ts` needs the matching zod entry. Detection is unchanged: `main/ipc/
worktrees.ts` and `orca-runtime.ts` already build an `AgentScratchWorktreePathMatcher` per
repo and pass it into `toDetectedWorktree`, which now resolves `visible` from the new field.

## Edge Cases

- **Selected checkout.** A scratch path registered as its own project stays visible
  regardless of the setting — the `isSelectedCheckout` branch precedes the gate.
- **Explicit import.** A path already in `importedExternalWorktreePaths` stays visible with
  the setting off.
- **Metadata fallback.** Detection failure keeps scratch hidden rather than failing open.
- **Orca-created worktrees under a scratch path.** `hasStrongOrcaMetadata` still wins before
  the path check, so an Orca-created worktree that happens to live under `.claude/worktrees/`
  remains `orca-managed`.
- **Setting on, zero scratch worktrees.** The second dialog row still renders, offering `Hide` —
  the opt-in must stay visible and reversible even after the agent that created the worktrees
  cleans them up, or there is no way to opt back out. Only the not-opted-in, zero-worktree case
  omits the row.
- **Scratch worktrees under more than one parent directory.** `AGENT_SCRATCH_PATH_PREFIXES`
  covers more than one directory family and the matcher anchors to any registered checkout, so
  hidden scratch worktrees can legitimately span multiple parents. The subtitle names the single
  parent only when every hidden worktree shares one; otherwise it reports a location count
  instead of naming just the first one's directory.
- **Scan backoff.** #9985's 5-minute TTL for agent-scratch *repo roots*
  (`isAgentScratchRepoRootPath`) is a separate matcher on repo paths and is unaffected.

## Test Plan

- `worktree-ownership.test.ts` — `agentWorktreeVisibility: 'show'` reveals scratch; absent and
  `'hide'` keep it hidden. Selected-checkout and explicit-import precedence preserved.
  `applyMetadataFallbackVisibility` still keeps scratch hidden.
- `external-worktree-inbox.test.ts` — the new accessors return only agent scratch, and
  `getHiddenExternalWorktrees` / `getVisibleExternalWorktrees` / inbox results are byte-for-byte
  unchanged. This is the #9535 regression guard.
- `WorktreeVisibilityDialog` — second row renders with count and parent path; omitted when not
  opted in with zero worktrees, but stays visible with a `Hide` control when opted in with zero;
  names a location count instead of a single path when hidden worktrees span multiple parents;
  toggle failure rolls the field back and surfaces the error, and stays visible even if the
  rollback write itself fails.
- **Invariant test** — for a repo whose `git worktree list` includes the main checkout, an
  Orca-created worktree, a plain external worktree, and a `.claude/worktrees/` worktree, each
  is either unconditionally visible or counted in exactly one dialog row, with both settings
  on and off. This is what stops a future path-list change from silently dropping a worktree
  again.

## Rollout

No migration. The field is optional and its absence reproduces current behavior, so existing
repos are untouched on upgrade. Users who lost worktrees to #9535 recover them from the
project menu once this ships.

Once a recovery path exists, adding a scratch location to
`AGENT_SCRATCH_PATH_PREFIXES` stops being a one-way door — a user who disagrees with the
classification can undo it from the project menu. That makes future list changes cheaper, but
none are proposed here.

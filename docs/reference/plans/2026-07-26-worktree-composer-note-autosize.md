# Worktree Composer Note Auto-Size

## Problem

Issue https://github.com/stablyai/orca/issues/10575 reports that the Create Worktree dialog clips the note it prefills from a linked PR.

Picking a PR on the Smart tab writes `PR #<number> — <title>` into the Note field. PR titles routinely wrap past one line, but the box stays one row tall and the overflow is unreachable:

- `src/renderer/src/hooks/useComposerState.ts:2771` calls `setNote(suggestedNote)` after the PR base resolves; `:2798` does the same for GitLab MRs.
- `src/renderer/src/components/NewWorkspaceComposerCard.tsx` sized the note textarea only inside its `onInput` handler.
- The same textarea carried `rows={1}`, `resize-none`, and `overflow-hidden`.

Reported symptom: focusing the note and pressing Down scrolls the caret into view but the field still renders one row, so the note reads as truncated no matter what the user does.

## Root Cause

`onInput` fires for text the user types or pastes. It does not fire when React writes a controlled `value` from state, which is exactly how the PR/MR prefill arrives. The auto-size pass therefore never ran for prefilled notes and the textarea kept its `rows={1}` height.

`overflow-hidden` then removed every fallback: no scrollbar, no wheel scrolling, and `resize-none` meant no drag handle either. The only thing that moved was the caret, which scrolls `scrollTop` without changing the rendered height.

Scope of the bug:

- PRs and GitLab MRs only. GitHub issues (`useComposerState.ts:2767` gates on `identity.type === 'pr'`) and Linear issues (`:3116`) deliberately do not prefill the note.
- Hand-typed notes were unaffected, because typing does fire `onInput`.
- `WorktreeMetaDialog` — the note editor for an existing worktree — was already correct: it sizes from a ref callback on mount and pairs `max-h-60` with `overflow-y-auto`.

## Non-Goals

- Adding a drag-to-resize handle. Auto-size plus scrolling removes the need, and `resize-none` keeps the field consistent with `WorktreeMetaDialog`.
- Changing which sources prefill the note, or the prefill text itself.
- Reworking the other auto-sizing textareas (`WorktreeMetaDialog`, `LinearIssueTextEditor`); they already behave correctly.

## Design

1. Add `src/renderer/src/hooks/useAutoSizedTextarea.ts`. It takes the current value and returns a ref callback, sizing the element both on attach and in a `useLayoutEffect` keyed on the value. Measuring in a layout effect covers programmatic writes and runs before paint, so the field never flashes at the wrong height.

2. Point the composer's note textarea at that hook and drop the `onInput` handler. Value-keyed resizing is a superset of it — typing updates `note`, which re-runs the effect.

3. Swap `overflow-hidden` for `overflow-y-auto scrollbar-sleek` while keeping `max-h-40`. The height stops growing at 160px and the remainder scrolls, so no content is ever unreachable. `scrollbar-sleek` is required by `pnpm check:styled-scrollbars` for any scrollable element.

`rows={1}` stays: it is the empty-state height, and the hook takes over as soon as there is content.

## Data Flow

- User picks a PR on the Smart tab.
- `handleSmartGitHubItemSelect` resolves the PR base, then `handleBaseBranchPrSelect` calls `setNote('PR #… — …')`.
- `NewWorkspaceComposerCard` re-renders with the new `note` prop.
- `useAutoSizedTextarea`'s layout effect resets the height to `auto`, reads `scrollHeight`, and writes it back.
- CSS `max-h-40` clamps the result; anything past it scrolls.

## Edge Cases

- **Collapsed Advanced drawer.** The drawer animates with `grid-rows-[0fr]` and always renders its children, so the textarea keeps its own layout box and `scrollHeight` stays measurable while collapsed. Expanding reveals an already-correct height.
- **Shrinking value.** `sizeToContent` resets to `height: auto` before measuring, so clearing the source (which resets the note to `''`) collapses the box instead of stranding the taller height.
- **Chunked large paste.** `pasteTextIntoTextControl` writes the DOM value in chunks and fires one final input event; React's `onChange` then updates `note` and the effect resizes. The box settles once the paste completes rather than growing mid-paste.
- **Notes longer than the clamp.** Height stops at `max-h-40` and the sleek scrollbar takes over — the previous `overflow-hidden` made this content unreachable.
- **Draft restore.** `persistDraft` composers mount with a non-empty note; the ref callback sizes on attach, so the restored note is not clipped either.

## Test Plan

- Unit (`src/renderer/src/components/NewWorkspaceComposerCard.test.tsx`, `NewWorkspaceComposerCard note field`):
  - a note present at mount sizes the box to its content;
  - a note that arrives after mount (the reported PR-prefill path) regrows the box;
  - the field keeps `max-h-40` and is scrollable rather than `overflow-hidden`.
  - happy-dom has no layout, so the suite stubs `HTMLElement.prototype.scrollHeight` for textareas — the same approach as `MobileHero.test.tsx`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## UI Quality Bar

An empty note still renders as a single compact row, so the collapsed dialog is unchanged. A prefilled note renders at its full wrapped height, up to 160px, after which a sleek scrollbar appears. No new controls, copy, or color values.

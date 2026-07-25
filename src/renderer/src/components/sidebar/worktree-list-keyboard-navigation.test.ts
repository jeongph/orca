import { describe, expect, it } from 'vitest'
import {
  resolveWorktreeNavigationAnchorId,
  resolveWorktreeNavigationTargetId
} from './worktree-list-keyboard-navigation'

const ROWS = ['wt-1', 'wt-2', 'wt-3']

describe('resolveWorktreeNavigationAnchorId', () => {
  it('prefers the selected workspace', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: 'wt-2',
        navHistory: ['wt-1'],
        navHistoryIndex: 0,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-2')
  })

  it('falls back to the current history entry when nothing is selected', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: null,
        navHistory: ['wt-1', 'wt-2'],
        navHistoryIndex: 1,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-2')
  })

  it('ignores history entries ahead of the history cursor', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: null,
        navHistory: ['wt-1', 'wt-2', 'wt-3'],
        navHistoryIndex: 1,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-2')
  })

  it('skips view entries and task-detail entries', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: null,
        navHistory: [
          'wt-2',
          'tasks',
          { kind: 'task-detail', source: 'linear', issue: { id: 'iss-1' } }
        ] as never,
        navHistoryIndex: 2,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-2')
  })

  it('skips history entries that are no longer in the list', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: null,
        navHistory: ['wt-1', 'wt-deleted'],
        navHistoryIndex: 1,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-1')
  })

  it('returns null when neither selection nor history resolves to a listed workspace', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: null,
        navHistory: [],
        navHistoryIndex: -1,
        navigableWorktreeIds: ROWS
      })
    ).toBeNull()
  })

  it('ignores a selection that is filtered out of the list', () => {
    expect(
      resolveWorktreeNavigationAnchorId({
        selectedWorktreeId: 'wt-hidden',
        navHistory: ['wt-3'],
        navHistoryIndex: 0,
        navigableWorktreeIds: ROWS
      })
    ).toBe('wt-3')
  })
})

describe('resolveWorktreeNavigationTargetId', () => {
  it('steps down and wraps at the end', () => {
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: 'wt-2',
        direction: 'down'
      })
    ).toBe('wt-3')
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: 'wt-3',
        direction: 'down'
      })
    ).toBe('wt-1')
  })

  it('steps up and wraps at the start', () => {
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: 'wt-2',
        direction: 'up'
      })
    ).toBe('wt-1')
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: 'wt-1',
        direction: 'up'
      })
    ).toBe('wt-3')
  })

  it('enters the list from either end when there is no anchor', () => {
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: null,
        direction: 'down'
      })
    ).toBe('wt-1')
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ROWS,
        anchorWorktreeId: null,
        direction: 'up'
      })
    ).toBe('wt-3')
  })

  it('returns null for an empty list', () => {
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: [],
        anchorWorktreeId: 'wt-1',
        direction: 'down'
      })
    ).toBeNull()
  })

  it('keeps cycling on a single-row list', () => {
    expect(
      resolveWorktreeNavigationTargetId({
        navigableWorktreeIds: ['wt-1'],
        anchorWorktreeId: 'wt-1',
        direction: 'down'
      })
    ).toBe('wt-1')
  })
})

describe('closing the active workspace keeps sidebar cycling in place', () => {
  // Repro: 3 workspaces, cycle 1 -> 2, close 2's last tab (landing fallback clears the
  // selection), then Cmd+Shift+Down must land on 3 instead of restarting at 1.
  const cycleFrom = (
    selectedWorktreeId: string | null,
    navHistory: string[],
    direction: 'up' | 'down'
  ): string | null =>
    resolveWorktreeNavigationTargetId({
      navigableWorktreeIds: ROWS,
      anchorWorktreeId: resolveWorktreeNavigationAnchorId({
        selectedWorktreeId,
        navHistory,
        navHistoryIndex: navHistory.length - 1,
        navigableWorktreeIds: ROWS
      }),
      direction
    })

  it('continues forward from the closed workspace', () => {
    expect(cycleFrom(null, ['wt-1', 'wt-2'], 'down')).toBe('wt-3')
  })

  it('continues backward from the closed workspace', () => {
    expect(cycleFrom(null, ['wt-1', 'wt-2'], 'up')).toBe('wt-1')
  })

  it('does not re-open the same workspace after closing the first one', () => {
    expect(cycleFrom(null, ['wt-1'], 'down')).toBe('wt-2')
  })
})

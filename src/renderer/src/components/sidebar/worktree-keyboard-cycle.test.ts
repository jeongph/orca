import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveCycledWorktreeId } from './worktree-keyboard-cycle'

describe('resolveCycledWorktreeId', () => {
  const worktreeIds = ['a', 'b', 'c']

  it('steps to the next and previous worktree', () => {
    expect(resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'a', direction: 'down' })).toBe(
      'b'
    )
    expect(resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'b', direction: 'up' })).toBe(
      'a'
    )
  })

  it('wraps around at both ends', () => {
    expect(resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'c', direction: 'down' })).toBe(
      'a'
    )
    expect(resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'a', direction: 'up' })).toBe(
      'c'
    )
  })

  it('enters from the matching end when the active worktree is not cyclable', () => {
    // Why: the active worktree stays selected inside a group the user collapsed,
    // so it is absent from the cyclable list; arrowing should not always jump to
    // the top.
    expect(
      resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'hidden', direction: 'down' })
    ).toBe('a')
    expect(
      resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: 'hidden', direction: 'up' })
    ).toBe('c')
    expect(resolveCycledWorktreeId({ worktreeIds, activeWorktreeId: null, direction: 'down' })).toBe(
      'a'
    )
  })

  it('has nothing to cycle to when every group is collapsed', () => {
    expect(resolveCycledWorktreeId({ worktreeIds: [], activeWorktreeId: 'a', direction: 'down' })).toBe(
      null
    )
  })
})

describe('WorktreeList keyboard cycling', () => {
  it('cycles over the visible rows so collapsed groups stay collapsed', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./WorktreeList.tsx', import.meta.url)),
      'utf8'
    )
    const navigateWorktree = source.slice(
      source.indexOf('const navigateWorktree = useCallback('),
      source.indexOf('const handleContainerKeyDown = useCallback(')
    )

    // Why: an empty collapsed set in this buildRows call is what forced
    // collapsed groups open; the sidebar's own collapsed set must be used.
    expect(navigateWorktree).toContain('prCache,\n        collapsedGroups,')
    expect(navigateWorktree).toContain('resolveCycledWorktreeId')
    expect(navigateWorktree).not.toContain('new Set<string>()')
  })
})

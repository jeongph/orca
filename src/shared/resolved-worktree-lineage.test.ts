import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import type { Worktree, WorktreeLineage } from './types'
import { projectResolvedWorktreeLineage } from './resolved-worktree-lineage'

function worktree(id: string, instanceId: string): Worktree {
  return {
    id,
    instanceId,
    repoId: 'repo',
    path: join('workspace', id),
    head: 'abc123',
    branch: `refs/heads/${id}`,
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

function lineage(overrides: Partial<WorktreeLineage> = {}): WorktreeLineage {
  return {
    worktreeId: 'child',
    worktreeInstanceId: 'child-instance',
    parentWorktreeId: 'parent',
    parentWorktreeInstanceId: 'parent-instance',
    origin: 'cli',
    capture: { source: 'explicit-cli-flag', confidence: 'explicit' },
    createdAt: 1,
    ...overrides
  }
}

describe('projectResolvedWorktreeLineage', () => {
  const parent = worktree('parent', 'parent-instance')
  const child = worktree('child', 'child-instance')

  it('projects exact instance-aware parent and child metadata', () => {
    const projected = projectResolvedWorktreeLineage([child, parent], { child: lineage() })

    expect(projected).toMatchObject([
      { id: 'child', parentWorktreeId: 'parent', childWorktreeIds: [], lineage: lineage() },
      { id: 'parent', parentWorktreeId: null, childWorktreeIds: ['child'], lineage: null }
    ])
  })

  it.each([
    ['stale child instance', lineage({ worktreeInstanceId: 'old-child' })],
    ['stale parent instance', lineage({ parentWorktreeInstanceId: 'old-parent' })],
    ['mismatched child record', lineage({ worktreeId: 'other-child' })]
  ])('rejects %s', (_label, candidate) => {
    const projected = projectResolvedWorktreeLineage([child, parent], { child: candidate })

    expect(projected).toMatchObject([
      { id: 'child', parentWorktreeId: null, lineage: null },
      { id: 'parent', childWorktreeIds: [] }
    ])
  })

  it('rejects a missing parent without mutating the raw lineage record', () => {
    const rawLineage = lineage()
    const projected = projectResolvedWorktreeLineage([child], { child: rawLineage })

    expect(projected[0]).toMatchObject({ parentWorktreeId: null, lineage: null })
    expect(rawLineage.parentWorktreeId).toBe('parent')
  })

  it('replaces disagreeing parent and child projections from the validated lineage record', () => {
    const projected = projectResolvedWorktreeLineage(
      [
        { ...child, parentWorktreeId: 'stale-parent', childWorktreeIds: ['stale-child'] },
        { ...parent, parentWorktreeId: 'stale-parent', childWorktreeIds: [] }
      ] as (Worktree & { parentWorktreeId: string; childWorktreeIds: string[] })[],
      { child: lineage() }
    )

    expect(projected).toMatchObject([
      { id: 'child', parentWorktreeId: 'parent', childWorktreeIds: [] },
      { id: 'parent', parentWorktreeId: null, childWorktreeIds: ['child'] }
    ])
  })
})

import type { Worktree, WorktreeLineage } from './types'

export type WorktreeWithResolvedLineage<T extends Worktree = Worktree> = T & {
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  lineage: WorktreeLineage | null
}

export function projectResolvedWorktreeLineage<T extends Worktree>(
  worktrees: readonly T[],
  lineageById: Readonly<Record<string, WorktreeLineage>>
): WorktreeWithResolvedLineage<T>[] {
  const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]))
  const validLineageByChildId = new Map<string, WorktreeLineage>()
  const childIdsByParentId = new Map<string, string[]>()

  for (const child of worktrees) {
    const childId = child.id
    const lineage = lineageById[childId]
    if (!lineage) {
      continue
    }
    const parent = worktreeById.get(lineage.parentWorktreeId)
    if (
      lineage.worktreeId !== childId ||
      !parent ||
      child.instanceId !== lineage.worktreeInstanceId ||
      parent.instanceId !== lineage.parentWorktreeInstanceId
    ) {
      continue
    }
    validLineageByChildId.set(childId, lineage)
    const children = childIdsByParentId.get(lineage.parentWorktreeId) ?? []
    children.push(childId)
    childIdsByParentId.set(lineage.parentWorktreeId, children)
  }

  return worktrees.map((worktree) => {
    const lineage = validLineageByChildId.get(worktree.id) ?? null
    return {
      ...worktree,
      parentWorktreeId: lineage?.parentWorktreeId ?? null,
      childWorktreeIds: childIdsByParentId.get(worktree.id) ?? [],
      lineage
    }
  })
}

import { isValidResolvedWorktreeLineageEdge } from '../../../../shared/resolved-worktree-lineage'
import type { Worktree, WorktreeLineage } from '../../../../shared/types'

export type LineageRenderInfo =
  | { state: 'none' }
  | { state: 'valid'; lineage: WorktreeLineage; parent: Worktree }
  | { state: 'missing'; lineage: WorktreeLineage }

type WorktreeWithResolvedLineage = Worktree & { lineage?: WorktreeLineage | null }

export function getProjectedWorktreeLineage(
  worktree: Worktree,
  lineageById: Readonly<Record<string, WorktreeLineage>>
): WorktreeLineage | null | undefined {
  if (Object.prototype.hasOwnProperty.call(lineageById, worktree.id)) {
    return lineageById[worktree.id]
  }
  return (worktree as WorktreeWithResolvedLineage).lineage
}

export function getLineageRenderInfo(
  worktree: Worktree,
  lineageById: Readonly<Record<string, WorktreeLineage>>,
  worktreeMap: ReadonlyMap<string, Worktree>
): LineageRenderInfo {
  const lineage = getProjectedWorktreeLineage(worktree, lineageById)
  if (!lineage) {
    return { state: 'none' }
  }
  const parent = worktreeMap.get(lineage.parentWorktreeId)
  if (!parent || !isValidResolvedWorktreeLineageEdge(worktree, parent, lineage)) {
    return { state: 'missing', lineage }
  }
  return { state: 'valid', lineage, parent }
}

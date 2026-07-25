import type { WorktreeNavHistoryEntry } from '@/store/slices/worktree-nav-history'

type AnchorArgs = {
  selectedWorktreeId: string | null
  navHistory: readonly WorktreeNavHistoryEntry[]
  navHistoryIndex: number
  navigableWorktreeIds: readonly string[]
}

// Why: page sentinels share the history entry type with workspace IDs, and object entries are task details.
function historyEntryWorkspaceId(entry: WorktreeNavHistoryEntry | undefined): string | null {
  if (typeof entry !== 'string' || entry === 'tasks' || entry === 'automations') {
    return null
  }
  return entry
}

/**
 * Pick the row keyboard cycling should step from. Closing a workspace's last tab clears the
 * selection (landing fallback), so fall back to the nav-history cursor — otherwise every step
 * after a close restarts at the top of the sidebar.
 */
export function resolveWorktreeNavigationAnchorId({
  selectedWorktreeId,
  navHistory,
  navHistoryIndex,
  navigableWorktreeIds
}: AnchorArgs): string | null {
  const navigable = new Set(navigableWorktreeIds)
  if (selectedWorktreeId !== null && navigable.has(selectedWorktreeId)) {
    return selectedWorktreeId
  }
  for (let i = Math.min(navHistoryIndex, navHistory.length - 1); i >= 0; i--) {
    const workspaceId = historyEntryWorkspaceId(navHistory[i])
    if (workspaceId !== null && navigable.has(workspaceId)) {
      return workspaceId
    }
  }
  return null
}

/** Step one row from the anchor, wrapping around; with no anchor, enter from the matching end. */
export function resolveWorktreeNavigationTargetId({
  navigableWorktreeIds,
  anchorWorktreeId,
  direction
}: {
  navigableWorktreeIds: readonly string[]
  anchorWorktreeId: string | null
  direction: 'up' | 'down'
}): string | null {
  if (navigableWorktreeIds.length === 0) {
    return null
  }
  const anchorIndex =
    anchorWorktreeId === null ? -1 : navigableWorktreeIds.indexOf(anchorWorktreeId)
  if (anchorIndex === -1) {
    const entryIndex = direction === 'down' ? 0 : navigableWorktreeIds.length - 1
    return navigableWorktreeIds[entryIndex]
  }
  const step = direction === 'down' ? 1 : -1
  const nextIndex =
    (anchorIndex + step + navigableWorktreeIds.length) % navigableWorktreeIds.length
  return navigableWorktreeIds[nextIndex]
}

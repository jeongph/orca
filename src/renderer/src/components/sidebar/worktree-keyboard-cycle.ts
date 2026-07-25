/** Pick the worktree that `worktree.navigateUp` / `worktree.navigateDown` moves
 *  to, cycling within the worktrees the sidebar is currently showing. */
export function resolveCycledWorktreeId(args: {
  worktreeIds: readonly string[]
  activeWorktreeId: string | null
  direction: 'up' | 'down'
}): string | null {
  const { worktreeIds, direction } = args
  if (worktreeIds.length === 0) {
    return null
  }

  const currentIndex = args.activeWorktreeId
    ? worktreeIds.indexOf(args.activeWorktreeId)
    : -1
  if (currentIndex === -1) {
    // Why: the active worktree can sit inside a collapsed group, so it is absent
    // from the cyclable list; enter from the end the keypress points away from.
    return (direction === 'down' ? worktreeIds[0] : worktreeIds.at(-1)) ?? null
  }

  const step = direction === 'down' ? 1 : -1
  const nextIndex = (currentIndex + step + worktreeIds.length) % worktreeIds.length
  return worktreeIds[nextIndex] ?? null
}

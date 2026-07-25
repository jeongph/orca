// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DetectedWorktree } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>
}))

afterEach(cleanup)

import WorktreeVisibilityDialog from './WorktreeVisibilityDialog'

function scratchWorktreeAt(path: string, visible: boolean): DetectedWorktree {
  return {
    id: path,
    path,
    ownership: 'agent-scratch',
    selectedCheckout: false,
    visible
  } as unknown as DetectedWorktree
}

function hiddenScratchAt(path: string): DetectedWorktree {
  return scratchWorktreeAt(path, false)
}

function visibleScratchAt(path: string): DetectedWorktree {
  return scratchWorktreeAt(path, true)
}

function renderDialog(options: {
  repo?: Record<string, unknown>
  detected?: DetectedWorktree[]
  fetchWorktreesResult?: boolean
  // Why: scripted per-call resolutions so a rollback write can be made to fail
  // independently of the initial write, matching the real store's call order.
  updateRepoResults?: boolean[]
}): {
  updateRepo: ReturnType<typeof vi.fn>
  fetchWorktrees: ReturnType<typeof vi.fn>
  closeModal: ReturnType<typeof vi.fn>
} {
  const updateRepoResults = options.updateRepoResults ?? []
  let updateRepoCallCount = 0
  // Why: mutates state like the real store, so a stuck-after-failed-rollback
  // field can actually flip which bucket the row reads from mid-test.
  const updateRepo = vi.fn(async (_projectId: string, updates: Record<string, unknown>) => {
    const result =
      updateRepoCallCount < updateRepoResults.length ? updateRepoResults[updateRepoCallCount] : true
    updateRepoCallCount += 1
    if (result) {
      Object.assign((mocks.state.repos as Record<string, unknown>[])[0], updates)
    }
    return result
  })
  const fetchWorktrees = vi.fn().mockResolvedValue(options.fetchWorktreesResult ?? true)
  const closeModal = vi.fn()
  mocks.state = {
    activeModal: 'worktree-visibility',
    modalData: { repoId: 'repo-1' },
    closeModal,
    repos: [
      {
        id: 'repo-1',
        kind: 'git',
        displayName: 'orca',
        path: '/repos/app',
        ...options.repo
      }
    ],
    updateRepo,
    fetchWorktrees,
    detectedWorktreesByRepo: {
      'repo-1': { authoritative: true, worktrees: options.detected ?? [] }
    }
  }
  render(<WorktreeVisibilityDialog />)
  return { updateRepo, fetchWorktrees, closeModal }
}

describe('WorktreeVisibilityDialog agent worktrees row', () => {
  it('shows the hidden count and parent path when the repo has not opted in', async () => {
    renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')]
    })

    expect(await screen.findByText(/Agent worktrees hidden/i)).toBeInTheDocument()
    expect(screen.getByText('/repos/app/.claude/worktrees')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Show agent worktrees$/ })).toBeInTheDocument()
  })

  it('omits the row when the repo has no agent scratch worktrees', () => {
    renderDialog({
      repo: { agentWorktreeVisibility: undefined, externalWorktreeVisibility: 'hide' },
      detected: []
    })

    expect(screen.queryByText(/Agent worktrees/i)).not.toBeInTheDocument()
    // Why: a positive anchor — without it this assertion would also pass if
    // the whole dialog failed to render, not just this row.
    expect(screen.getByText(/Hidden from sidebar/i)).toBeInTheDocument()
  })

  it('writes the opt-in and refreshes without closing the dialog', async () => {
    const { updateRepo, fetchWorktrees, closeModal } = renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')]
    })

    await userEvent.click(screen.getByRole('button', { name: /^Show agent worktrees$/ }))

    expect(updateRepo).toHaveBeenCalledWith('repo-1', { agentWorktreeVisibility: 'show' })
    expect(fetchWorktrees).toHaveBeenCalledWith('repo-1', { requireAuthoritative: true })
    expect(closeModal).not.toHaveBeenCalled()
  })

  it('rolls the field back and surfaces an error when the refresh fails', async () => {
    const { updateRepo } = renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')],
      fetchWorktreesResult: false
    })

    await userEvent.click(screen.getByRole('button', { name: /^Show agent worktrees$/ }))

    expect(updateRepo).toHaveBeenLastCalledWith('repo-1', { agentWorktreeVisibility: 'hide' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not show agent worktrees/i)
  })

  it('keeps the row and its error visible when the rollback write also fails', async () => {
    renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')],
      fetchWorktreesResult: false,
      // Why: first call (the opt-in write) succeeds and sticks; second call
      // (the rollback) fails, leaving agentWorktreeVisibility stuck at 'show'
      // against the stale, unrefreshed `detected` list.
      updateRepoResults: [true, false]
    })

    await userEvent.click(screen.getByRole('button', { name: /^Show agent worktrees$/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not show agent worktrees/i)
    // Why: /Agent worktrees/i alone also matches the error text above — assert
    // the row's title specifically to confirm the row itself, not just the
    // alert, survived the stuck-visibility flip.
    expect(screen.getByText(/Agent worktrees shown/i)).toBeInTheDocument()
  })

  it('offers Hide with the shown count once opted in', () => {
    renderDialog({
      repo: { agentWorktreeVisibility: 'show' },
      detected: [visibleScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')]
    })

    expect(screen.getByText(/1 currently shown/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Hide agent worktrees$/ })).toBeInTheDocument()
  })

  it('keeps the row visible with a Hide control when opted in but currently empty', () => {
    // Why: the agent finished and cleaned up its scratch worktree, so the
    // hidden/visible buckets are both empty even though the repo opted in —
    // the row must not disappear, or there is no way to opt back out.
    renderDialog({
      repo: { agentWorktreeVisibility: 'show' },
      detected: []
    })

    expect(screen.getByText(/Agent worktrees shown/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Hide agent worktrees$/ })).toBeInTheDocument()
  })

  it('keeps the min-w-0 chain that lets the path truncate instead of overflowing the dialog', () => {
    // Why: happy-dom computes no real layout — getBoundingClientRect and
    // scrollWidth/clientWidth all report 0 (verified empirically) — so this
    // cannot assert actual truncation or that the row stays inside the
    // dialog. It can only guard the specific utility classes a real browser
    // needs for that to happen, which is exactly what shipped broken
    // silently before: `flex-1` on the label defeats truncate (flex-basis:0
    // forces it to claim all row slack instead of shrinking), and the two
    // ancestor `div`s between the label and DialogContent's grid need
    // min-w-0 or their intrinsic content width — the full untruncated path —
    // inflates the shared grid column and drags the sibling non-Orca row's
    // width along with it. The e2e harness is the only real guard for the
    // geometry itself; see tests/e2e/zz-agent-scratch-visibility-*.spec.ts.
    renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose')]
    })

    const label = screen.getByText('/repos/app/.claude/worktrees')
    const labelClasses = label.className.split(' ')
    expect(labelClasses).not.toContain('flex-1')
    expect(labelClasses).toContain('min-w-0')
    expect(labelClasses).toContain('truncate')

    const subtitleRow = label.parentElement
    const contentColumn = subtitleRow?.parentElement
    const borderedRow = contentColumn?.parentElement
    const gridWrapper = borderedRow?.parentElement
    expect(borderedRow?.className.split(' ')).toContain('min-w-0')
    expect(gridWrapper?.className.split(' ')).toContain('min-w-0')
  })

  it('shows a location count instead of a single path when scratch worktrees span multiple locations', () => {
    renderDialog({
      repo: { agentWorktreeVisibility: undefined },
      detected: [
        hiddenScratchAt('/repos/app/.claude/worktrees/eager-dazzling-rose'),
        hiddenScratchAt('/repos/app/.gsd-workspaces/brave-comet')
      ]
    })

    expect(screen.getByText(/2 across 2 locations/i)).toBeInTheDocument()
    // Why: naming just the first worktree's parent would misreport where the
    // second one actually lives — assert neither single path is shown alone.
    expect(screen.queryByText('/repos/app/.claude/worktrees')).not.toBeInTheDocument()
    expect(screen.queryByText('/repos/app/.gsd-workspaces')).not.toBeInTheDocument()
  })
})

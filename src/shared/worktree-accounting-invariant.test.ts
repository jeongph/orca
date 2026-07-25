import { describe, expect, it } from 'vitest'

import {
  getHiddenAgentScratchWorktrees,
  getHiddenExternalWorktrees,
  getVisibleAgentScratchWorktrees,
  getVisibleExternalWorktrees
} from './external-worktree-inbox'
import { buildKnownOrcaWorkspaceLayouts, toDetectedWorktree } from './worktree-ownership'
import type {
  DetectedWorktreeListResult,
  ExternalWorktreeVisibility,
  GlobalSettings,
  Repo,
  Worktree
} from './types'

const REPO_PATH = '/repos/app'
const SETTINGS = {
  workspaceDir: '/repos/workspaces',
  nestWorkspaces: true,
  workspaceDirHistory: []
} as unknown as GlobalSettings

// Every worktree git reports, one per ownership class the sidebar can produce.
const PATHS = {
  main: REPO_PATH,
  orcaManaged: '/repos/workspaces/app/feature-x',
  external: '/repos/manual-checkout',
  agentScratch: `${REPO_PATH}/.claude/worktrees/eager-dazzling-rose`
}

function makeRepo(agentWorktreeVisibility?: ExternalWorktreeVisibility): Repo {
  return {
    id: 'repo-1',
    path: REPO_PATH,
    displayName: 'app',
    badgeColor: '#000',
    addedAt: Date.UTC(2026, 6, 1),
    kind: 'git',
    externalWorktreeVisibility: 'show',
    externalWorktreeVisibilityLegacy: false,
    ...(agentWorktreeVisibility ? { agentWorktreeVisibility } : {})
  } as unknown as Repo
}

function makeWorktree(path: string): Worktree {
  return {
    id: `repo-1::${path}`,
    repoId: 'repo-1',
    path,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: path === REPO_PATH,
    displayName: 'wt',
    workspaceStatus: 'todo'
  } as unknown as Worktree
}

function detectAll(repo: Repo): DetectedWorktreeListResult {
  const layouts = buildKnownOrcaWorkspaceLayouts(SETTINGS, repo)
  const worktrees = Object.values(PATHS).map((path) =>
    toDetectedWorktree({
      repo,
      settings: SETTINGS,
      worktree: makeWorktree(path),
      knownOrcaLayouts: layouts,
      // Only the Orca-created path carries creation metadata.
      ...(path === PATHS.orcaManaged
        ? { meta: { orcaCreatedAt: 1, displayName: '', comment: '' } as never }
        : {})
    })
  )
  return { authoritative: true, worktrees } as unknown as DetectedWorktreeListResult
}

describe('worktree accounting invariant', () => {
  for (const setting of [undefined, 'hide', 'show'] as const) {
    it(`accounts for every worktree with agentWorktreeVisibility=${setting ?? 'unset'}`, () => {
      const repo = makeRepo(setting)
      const detected = detectAll(repo)

      const buckets = [
        getHiddenExternalWorktrees(detected),
        getVisibleExternalWorktrees(detected),
        getHiddenAgentScratchWorktrees(detected),
        getVisibleAgentScratchWorktrees(detected)
      ]

      for (const worktree of detected.worktrees) {
        const alwaysVisible = worktree.selectedCheckout || worktree.ownership === 'orca-managed'
        const hits = buckets.filter((bucket) => bucket.some((w) => w.id === worktree.id)).length

        if (alwaysVisible) {
          expect({ path: worktree.path, hits, visible: worktree.visible }).toEqual({
            path: worktree.path,
            hits: 0,
            visible: true
          })
          continue
        }
        // Why: exactly one bucket — zero means the worktree is invisible everywhere,
        // which is the #9535 failure mode this test exists to prevent.
        expect({ path: worktree.path, hits }).toEqual({ path: worktree.path, hits: 1 })
      }
    })
  }

  it('moves agent scratch from the hidden bucket to the shown bucket on opt-in', () => {
    expect(getHiddenAgentScratchWorktrees(detectAll(makeRepo())).map((w) => w.path)).toEqual([
      PATHS.agentScratch
    ])
    expect(getVisibleAgentScratchWorktrees(detectAll(makeRepo('show'))).map((w) => w.path)).toEqual(
      [PATHS.agentScratch]
    )
  })
})

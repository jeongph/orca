import React, { useCallback, useState } from 'react'
import { Bot, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  getHiddenAgentScratchWorktrees,
  getHiddenExternalWorktrees,
  getVisibleAgentScratchWorktrees,
  getVisibleExternalWorktrees
} from '../../../../shared/external-worktree-inbox'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import {
  effectiveExternalWorktreeVisibility,
  isLegacyRepoForExternalWorktreeVisibility
} from '../../../../shared/worktree-ownership'
import { translate } from '@/i18n/i18n'
import { groupWorktreesByParentPath } from './ImportedWorktreesVisibilityLine'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'

// Why: locales reorder count/path in the sentence (#9294-style); translate the
// whole sentence with the path as a sentinel token, then split on it to embed
// the path in its own element. NUL cannot appear in a real filesystem path.
const AGENT_PARENT_PATH_TOKEN = '\u0000'

export default function WorktreeVisibilityDialog(): React.JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const repos = useAppStore((s) => s.repos)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const detectedWorktreesByRepo = useAppStore((s) => s.detectedWorktreesByRepo)

  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const repo = repos.find((candidate) => candidate.id === repoId) ?? null
  const detected = repoId ? detectedWorktreesByRepo[repoId] : undefined
  const showOther = repo
    ? effectiveExternalWorktreeVisibility(repo, isLegacyRepoForExternalWorktreeVisibility(repo)) ===
      'show'
    : false
  const hiddenCount = getHiddenExternalWorktrees(detected).length
  const otherCount = getVisibleExternalWorktrees(detected).length
  const hiddenWorktreeLabel = `${hiddenCount} ${hiddenCount === 1 ? 'worktree' : 'worktrees'}`
  const shownWorktreeLabel = `${otherCount} ${otherCount === 1 ? 'worktree' : 'worktrees'}`

  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentPending, setAgentPending] = useState(false)
  // Why: if the rollback updateRepo also fails, agentWorktreeVisibility is
  // stuck at the failed `next` value, which can flip which (now-stale) bucket
  // agentWorktrees reads to an empty one — force the row to stay rendered so
  // the error below doesn't vanish with it.
  const [agentForceVisible, setAgentForceVisible] = useState(false)
  const showAgent = repo?.agentWorktreeVisibility === 'show'
  const agentWorktrees = showAgent
    ? getVisibleAgentScratchWorktrees(detected)
    : getHiddenAgentScratchWorktrees(detected)
  // Why: AGENT_SCRATCH_PATH_PREFIXES spans multiple directory families and the
  // matcher anchors to any registered checkout, so hidden scratch worktrees
  // can legitimately sit under more than one parent — naming just the first
  // one would misreport where the others actually are (see #agent-scratch-
  // worktree-visibility.md "subtitle can name the wrong directory").
  const agentWorktreeGroups = groupWorktreesByParentPath(agentWorktrees)
  const agentParentPath = agentWorktreeGroups.length === 1 ? agentWorktreeGroups[0].path : ''
  const [agentHiddenCountBeforePath, agentHiddenCountAfterPath] = translate(
    'sidebar.worktreeVisibility.agentWorktrees.hiddenCount',
    '{{count}} in {{path}}',
    { count: agentWorktrees.length, path: AGENT_PARENT_PATH_TOKEN }
  ).split(AGENT_PARENT_PATH_TOKEN)

  const handleToggle = useCallback(async () => {
    if (!repoId) {
      return
    }
    await updateRepo(repoId, {
      externalWorktreeVisibility: showOther ? 'hide' : 'show',
      // Why: showing hidden externals again should re-enable the inbox if the
      // user previously opted out of discovery prompts for this repo.
      // Why: null is the transport sentinel for clearing on remote runtime paths
      // where `undefined` is stripped before persistence.
      ...(!showOther ? { externalWorktreeDiscoverySuppressedAt: null } : {})
    })
    await fetchWorktrees(repoId)
    closeModal()
  }, [closeModal, fetchWorktrees, repoId, showOther, updateRepo])

  // Why: unlike handleToggle, this must not close the dialog — the point of
  // surfacing agent worktrees is letting the user watch the count move.
  const handleToggleAgent = useCallback(async () => {
    if (!repoId) {
      return
    }
    const next = showAgent ? 'hide' : 'show'
    const previous = showAgent ? 'show' : 'hide'
    setAgentPending(true)
    setAgentError(null)
    setAgentForceVisible(false)
    const failureMessage = showAgent
      ? translate(
          'sidebar.worktreeVisibility.agentWorktrees.hideError',
          'Could not hide agent worktrees. Try again.'
        )
      : translate(
          'sidebar.worktreeVisibility.agentWorktrees.showError',
          'Could not show agent worktrees. Try again.'
        )

    const updated = await updateRepo(repoId, { agentWorktreeVisibility: next })
    if (!updated) {
      setAgentPending(false)
      setAgentError(failureMessage)
      return
    }
    const refreshed = await fetchWorktrees(repoId, { requireAuthoritative: true })
    if (!refreshed) {
      // Why: mirror showImportedWorktreesCard — a stale list must not look like a successful toggle.
      const rolledBack = await updateRepo(repoId, { agentWorktreeVisibility: previous })
      setAgentPending(false)
      setAgentError(failureMessage)
      if (!rolledBack) {
        setAgentForceVisible(true)
      }
      return
    }
    setAgentPending(false)
  }, [fetchWorktrees, repoId, showAgent, updateRepo])

  if (activeModal !== 'worktree-visibility' || !repo || !isGitRepoKind(repo)) {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.WorktreeVisibilityDialog.83a5ba8dd1',
              'Non-Orca worktrees'
            )}
          </DialogTitle>
          <DialogDescription>{repo.displayName}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
            {showOther ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {showOther
                ? translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.3e045d4cb8',
                    'Shown in sidebar'
                  )
                : translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.5d02a5647f',
                    'Hidden from sidebar'
                  )}
            </div>
            <div className="text-xs text-muted-foreground">
              {showOther
                ? translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.8372e4bbd9',
                    '{{value0}} currently shown',
                    { value0: shownWorktreeLabel }
                  )
                : translate(
                    'auto.components.sidebar.WorktreeVisibilityDialog.25ddf19920',
                    '{{value0}} available to import',
                    { value0: hiddenWorktreeLabel }
                  )}
            </div>
          </div>
          <Button
            type="button"
            variant={showOther ? 'secondary' : 'outline'}
            onClick={handleToggle}
          >
            {showOther
              ? translate('auto.components.sidebar.WorktreeVisibilityDialog.759371df43', 'Hide')
              : translate('auto.components.sidebar.WorktreeVisibilityDialog.f1f71b9f02', 'Import')}
          </Button>
        </div>

        {showAgent || agentWorktrees.length > 0 || agentForceVisible ? (
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {showAgent
                    ? translate(
                        'sidebar.worktreeVisibility.agentWorktrees.shownTitle',
                        'Agent worktrees shown'
                      )
                    : translate(
                        'sidebar.worktreeVisibility.agentWorktrees.hiddenTitle',
                        'Agent worktrees hidden'
                      )}
                </div>
                {showAgent ? (
                  <div className="text-xs text-muted-foreground">
                    {translate(
                      'sidebar.worktreeVisibility.agentWorktrees.shownCount',
                      '{{count}} currently shown',
                      { count: agentWorktrees.length }
                    )}
                  </div>
                ) : agentWorktreeGroups.length > 1 ? (
                  <div className="text-xs text-muted-foreground">
                    {translate(
                      'sidebar.worktreeVisibility.agentWorktrees.hiddenCountAcrossLocations',
                      '{{count}} across {{locations}} locations',
                      { count: agentWorktrees.length, locations: agentWorktreeGroups.length }
                    )}
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center text-xs text-muted-foreground">
                    <span className="shrink-0 whitespace-pre">{agentHiddenCountBeforePath}</span>
                    <TruncatedSidebarLabel
                      text={agentParentPath}
                      tooltipSide="top"
                      className="font-mono"
                    />
                    <span className="shrink-0 whitespace-pre">{agentHiddenCountAfterPath}</span>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant={showAgent ? 'secondary' : 'outline'}
                disabled={agentPending}
                aria-label={
                  showAgent
                    ? translate(
                        'sidebar.worktreeVisibility.agentWorktrees.hideAriaLabel',
                        'Hide agent worktrees'
                      )
                    : translate(
                        'sidebar.worktreeVisibility.agentWorktrees.showAriaLabel',
                        'Show agent worktrees'
                      )
                }
                onClick={handleToggleAgent}
              >
                {showAgent
                  ? translate('sidebar.worktreeVisibility.agentWorktrees.hide', 'Hide')
                  : translate('sidebar.worktreeVisibility.agentWorktrees.show', 'Show')}
              </Button>
            </div>
            {agentError ? (
              <p className="px-1 text-[11px] leading-4 text-destructive" role="alert">
                {agentError}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

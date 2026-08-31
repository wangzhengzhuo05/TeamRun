import { useEffect, useRef, useState } from 'react'
import { Bot, ExternalLink, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AgentRun,
  ContextSnapshot,
  ResultPublication,
  VerificationResult
} from '../../../../shared/teamrun-api'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { useAppStore } from '@/store'
import { teamRunStatusFromAgent } from '@/lib/teamrun-agent-status'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { getAgentLabel } from '@/lib/agent-catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RunVerificationDialog } from './RunVerificationDialog'
import { PublishAgentResultDialog } from './PublishAgentResultDialog'
import { TeamAgentLauncher } from './TeamAgentLauncher'
import { CompareAgentRunsDialog } from './CompareAgentRunsDialog'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  taskId: string
  projectId: string
  taskTitle: string
  snapshots: ContextSnapshot[]
  runs: AgentRun[]
  publications: ResultPublication[]
  verifications: Record<string, VerificationResult[]>
  canDevelop: boolean
  onRefresh: () => Promise<void>
  onTaskChanged: () => Promise<void>
}

const RUN_LABEL: Record<AgentRun['status'], () => string> = {
  queued: () => translate('teamRun.agentStatus.queued', 'Queued'),
  starting: () => translate('teamRun.agentStatus.starting', 'Starting'),
  working: () => translate('teamRun.agentStatus.working', 'Working'),
  needs_input: () => translate('teamRun.agentStatus.needsInput', 'Needs input'),
  review: () => translate('teamRun.agentStatus.review', 'Ready for review'),
  completed: () => translate('teamRun.agentStatus.completed', 'Published'),
  failed: () => translate('teamRun.agentStatus.failed', 'Failed'),
  canceled: () => translate('teamRun.agentStatus.canceled', 'Canceled')
}

export function TeamAgentRunPanel(props: Props) {
  const { canDevelop, onRefresh, runs } = props
  const agentStatusEpoch = useAppStore((state) => state.agentStatusEpoch)
  const [workspaceIds, setWorkspaceIds] = useState<Record<string, string>>({})
  const syncingRuns = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    void Promise.all(
      runs.map(async (run) => {
        const workspace = await window.api.teamRun.runs.resolveWorkspace(run.clientRunId)
        return [run.clientRunId, workspace?.workspaceId ?? null] as const
      })
    ).then((pairs) => {
      if (!active) {
        return
      }
      setWorkspaceIds(
        Object.fromEntries(pairs.filter((pair): pair is [string, string] => pair[1] !== null))
      )
    })
    return () => {
      active = false
    }
  }, [runs])

  useEffect(() => {
    if (!canDevelop) {
      return
    }
    void agentStatusEpoch
    const entries = Object.values(useAppStore.getState().agentStatusByPaneKey)
    const updates: Promise<unknown>[] = []
    for (const run of runs) {
      if (
        run.status === 'queued' ||
        run.status === 'completed' ||
        run.status === 'failed' ||
        run.status === 'canceled'
      ) {
        continue
      }
      const workspaceId = workspaceIds[run.clientRunId]
      if (!workspaceId || syncingRuns.current.has(run.id)) {
        continue
      }
      const latest = entries
        .filter((entry) => entry.worktreeId === workspaceId)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      if (!latest) {
        continue
      }
      const status = teamRunStatusFromAgent(latest)
      if (
        !status ||
        status === run.status ||
        (run.status === 'review' && status === 'needs_input')
      ) {
        continue
      }
      syncingRuns.current.add(run.id)
      updates.push(
        window.api.teamRun.runs
          .updateStatus({
            runId: run.id,
            status: {
              sequence: run.lastSequence + 1,
              status,
              heartbeatAt: new Date(latest.updatedAt).toISOString()
            }
          })
          .catch(() => undefined)
          .finally(() => syncingRuns.current.delete(run.id))
      )
    }
    if (updates.length > 0) {
      void Promise.allSettled(updates).then(() => onRefresh().catch(() => undefined))
    }
  }, [agentStatusEpoch, canDevelop, onRefresh, runs, workspaceIds])
  const openWorkspace = async (run: AgentRun) => {
    const workspace = await window.api.teamRun.runs.resolveWorkspace(run.clientRunId)
    if (!workspace || !activateAndRevealWorktree(workspace.workspaceId)) {
      toast.error(
        translate(
          'auto.components.team.space.TeamAgentRunPanel.872ca19575',
          'This agent workspace is not available on this device.'
        )
      )
    }
  }

  const markReady = async (run: AgentRun) => {
    try {
      await window.api.teamRun.runs.updateStatus({
        runId: run.id,
        status: {
          sequence: run.lastSequence + 1,
          status: 'review',
          heartbeatAt: new Date().toISOString()
        }
      })
      await props.onRefresh()
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentRunPanel.markReadyError',
          'Unable to mark the run ready for review'
        )
      )
    }
  }

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl">
        {props.canDevelop ? (
          <TeamAgentLauncher
            taskId={props.taskId}
            taskTitle={props.taskTitle}
            latestSnapshot={props.snapshots[0] ?? null}
            onRefresh={props.onRefresh}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentRunPanel.ownerAdminOnly',
              'Only the Team Owner or an Admin can start work for this Team Task.'
            )}
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <CompareAgentRunsDialog runs={props.runs} />
        </div>
        <div className="mt-3 space-y-3">
          {props.runs.map((run) => {
            const publication = props.publications.find((item) => item.agentRunId === run.id)
            const checks = props.verifications[run.id] ?? []
            return (
              <article key={run.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Bot className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {getAgentLabel(run.agentKind as TuiAgent)}
                      {run.teamAgentSnapshot ? ` · ${run.teamAgentSnapshot.name}` : ''}
                    </span>
                    <Badge variant={run.status === 'failed' ? 'destructive' : 'outline'}>
                      {RUN_LABEL[run.status]()}
                    </Badge>
                    {run.stale ? (
                      <Badge variant="secondary">
                        {translate(
                          'auto.components.team.space.TeamAgentRunPanel.3412fc359a',
                          'Stale context'
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {props.canDevelop ? (
                      <RunVerificationDialog run={run} onCompleted={props.onRefresh} />
                    ) : null}
                    {props.canDevelop &&
                    (run.status === 'working' || run.status === 'needs_input') ? (
                      <Button variant="outline" size="sm" onClick={() => markReady(run)}>
                        {translate(
                          'auto.components.team.space.TeamAgentRunPanel.cecf8c7075',
                          'Ready for review'
                        )}
                      </Button>
                    ) : null}
                    {props.canDevelop && run.status === 'review' ? (
                      <PublishAgentResultDialog
                        run={run}
                        verifications={checks}
                        onPublished={async () => {
                          await Promise.all([props.onRefresh(), props.onTaskChanged()])
                        }}
                      />
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => openWorkspace(run)}>
                      <ExternalLink />{' '}
                      {translate(
                        'auto.components.team.space.TeamAgentRunPanel.c254620589',
                        'Open workspace'
                      )}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    {run.baseRevision.kind === 'git'
                      ? run.baseRevision.objectId.slice(0, 12)
                      : translate(
                          'auto.components.team.space.TeamAgentRunPanel.ae51fd0785',
                          'Folder workspace'
                        )}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3.5" /> {checks.length}{' '}
                    {translate(
                      'auto.components.team.space.TeamAgentRunPanel.62179c7416',
                      'verification'
                    )}
                    {checks.length === 1 ? '' : 's'}
                  </span>
                  {publication ? (
                    <span>
                      {translate(
                        'auto.components.team.space.TeamAgentRunPanel.1ea0087769',
                        'Published revision'
                      )}
                      {publication.revision}
                    </span>
                  ) : null}
                </div>
              </article>
            )
          })}
          {props.runs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamAgentRunPanel.72ba875f87',
                'No agent runs for this task.'
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

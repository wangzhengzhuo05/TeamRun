import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  AgentRun,
  ContextSnapshot,
  ResultPublication,
  VerificationResult
} from '../../../../shared/teamrun-api'
import { useAppStore } from '@/store'
import { teamRunStatusFromAgent } from '@/lib/teamrun-agent-status'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { TeamAgentLauncher } from './TeamAgentLauncher'
import { TeamAgentRunCard } from './TeamAgentRunCard'
import { TeamServerAgentLauncher } from './TeamServerAgentLauncher'
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

export function TeamAgentRunPanel(props: Props) {
  const { canDevelop, onRefresh, runs } = props
  const agentStatusEpoch = useAppStore((state) => state.agentStatusEpoch)
  const [workspaceIds, setWorkspaceIds] = useState<Record<string, string>>({})
  const syncingRuns = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    void Promise.all(
      runs
        .filter((run) => run.executionTarget !== 'team_server')
        .map(async (run) => {
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
        run.executionTarget === 'team_server' ||
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
          <div className="space-y-3">
            <TeamServerAgentLauncher
              projectId={props.projectId}
              taskId={props.taskId}
              latestSnapshot={props.snapshots[0] ?? null}
              onRefresh={props.onRefresh}
            />
            <TeamAgentLauncher
              taskId={props.taskId}
              taskTitle={props.taskTitle}
              latestSnapshot={props.snapshots[0] ?? null}
              onRefresh={props.onRefresh}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentRunPanel.ownerAdminOnly',
              'Only the Team Owner or an Admin can start work for this Team Task.'
            )}
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <CompareAgentRunsDialog
            runs={props.runs.filter((run) => run.executionTarget !== 'team_server')}
          />
        </div>
        <div className="mt-3 space-y-3">
          {props.runs.map((run) => {
            const publication = props.publications.find((item) => item.agentRunId === run.id)
            const checks = props.verifications[run.id] ?? []
            return (
              <TeamAgentRunCard
                key={run.id}
                run={run}
                publication={publication}
                checks={checks}
                canDevelop={props.canDevelop}
                onOpenWorkspace={openWorkspace}
                onMarkReady={markReady}
                onRefresh={props.onRefresh}
                onTaskChanged={props.onTaskChanged}
              />
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

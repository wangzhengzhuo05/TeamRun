import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  AgentRun,
  ContextSnapshot,
  OrganizationMember,
  ResultPublication,
  Task,
  TaskComment,
  TaskStatus,
  VerificationResult
} from '../../../../shared/teamrun-api'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'
import { teamRunErrorMessage } from './teamrun-error-message'

type TeamTaskWorkspace = {
  task: Task | null
  members: OrganizationMember[]
  comments: TaskComment[]
  snapshots: ContextSnapshot[]
  runs: AgentRun[]
  publications: ResultPublication[]
  verifications: Record<string, VerificationResult[]>
  loading: boolean
  updateStatus: (status: TaskStatus) => Promise<void>
  updateOwner: (ownerUserId: string) => Promise<void>
  addComment: (bodyMarkdown: string) => Promise<void>
  createSnapshot: () => Promise<ContextSnapshot | null>
  refreshRuns: () => Promise<void>
}

function reportError(error: unknown): void {
  toast.error(
    teamRunErrorMessage(
      error,
      translate('auto.components.team.space.useTeamTaskWorkspace.d72b3e04bf', 'Unable to load task')
    )
  )
}

export function useTeamTaskWorkspace(
  taskId: string | null,
  onTaskChanged: () => Promise<void>,
  eventRevision = 0
): TeamTaskWorkspace {
  const [task, setTask] = useState<Task | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [snapshots, setSnapshots] = useState<ContextSnapshot[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [publications, setPublications] = useState<ResultPublication[]>([])
  const [verifications, setVerifications] = useState<Record<string, VerificationResult[]>>({})
  const [loading, setLoading] = useState(false)

  const refreshRuns = useCallback(async () => {
    if (!taskId) return
    const [next, nextPublications] = await Promise.all([
      window.api.teamRun.runs.list(taskId),
      window.api.teamRun.publications.list(taskId)
    ])
    setRuns(next)
    setPublications(nextPublications)
    const pairs = await Promise.all(
      next.map(
        async (run) => [run.id, await window.api.teamRun.runs.listVerifications(run.id)] as const
      )
    )
    setVerifications(Object.fromEntries(pairs))
  }, [eventRevision, taskId])

  useEffect(() => {
    setTask(null)
    setMembers([])
    setComments([])
    setSnapshots([])
    setRuns([])
    setPublications([])
    setVerifications({})
    if (!taskId) return
    let active = true
    setLoading(true)
    void Promise.all([
      window.api.teamRun.tasks.get(taskId),
      window.api.teamRun.tasks.listComments(taskId),
      window.api.teamRun.tasks.listSnapshots(taskId),
      window.api.teamRun.runs.list(taskId),
      window.api.teamRun.publications.list(taskId)
    ])
      .then(async ([nextTask, nextComments, nextSnapshots, nextRuns, nextPublications]) => {
        const [pairs, nextMembers] = await Promise.all([
          Promise.all(
            nextRuns.map(
              async (run) =>
                [run.id, await window.api.teamRun.runs.listVerifications(run.id)] as const
            )
          ),
          window.api.teamRun.organizations.listMembers(nextTask.organizationId)
        ])
        if (!active) return
        setTask(nextTask)
        setMembers(nextMembers)
        setComments(nextComments)
        setSnapshots(nextSnapshots)
        setRuns(nextRuns)
        setPublications(nextPublications)
        setVerifications(Object.fromEntries(pairs))
      })
      .catch(reportError)
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [taskId])

  const updateStatus = useCallback(
    async (status: TaskStatus) => {
      if (!task) return
      try {
        const next = await window.api.teamRun.tasks.update({
          taskId: task.id,
          changes: { version: task.version, status }
        })
        setTask(next)
        await onTaskChanged()
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.useTeamTaskWorkspace.updateStatus',
            'Unable to update task status'
          )
        )
      }
    },
    [onTaskChanged, task]
  )

  const updateOwner = useCallback(
    async (ownerUserId: string) => {
      if (!task || ownerUserId === task.ownerUserId) return
      try {
        const next = await window.api.teamRun.tasks.update({
          taskId: task.id,
          changes: { version: task.version, ownerUserId }
        })
        setTask(next)
        await onTaskChanged()
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.useTeamTaskWorkspace.updateOwner',
            'Unable to change task owner'
          )
        )
      }
    },
    [onTaskChanged, task]
  )

  const addComment = useCallback(
    async (bodyMarkdown: string) => {
      if (!task) return
      try {
        const created = await window.api.teamRun.tasks.createComment({
          taskId: task.id,
          comment: { bodyMarkdown }
        })
        setComments((current) => [...current, created])
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.useTeamTaskWorkspace.addComment',
            'Unable to add comment'
          )
        )
      }
    },
    [task]
  )

  const createSnapshot = useCallback(async () => {
    if (!task) return null
    try {
      const created = await window.api.teamRun.tasks.createSnapshot({
        taskId: task.id,
        snapshot: {
          taskVersion: task.version,
          includeComments: true,
          includeProjectContext: true,
          includeExternalSource: true
        }
      })
      setSnapshots((current) => [created, ...current])
      return created
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.useTeamTaskWorkspace.createSnapshot',
          'Unable to freeze context'
        )
      )
      return null
    }
  }, [task])

  return {
    task,
    members,
    comments,
    snapshots,
    runs,
    publications,
    verifications,
    loading,
    updateStatus,
    updateOwner,
    addComment,
    createSnapshot,
    refreshRuns
  }
}

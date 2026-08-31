import { z } from 'zod'
import {
  createContextSnapshotRequestSchema,
  createTaskCommentRequestSchema,
  createTaskRequestSchema,
  updateTaskRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { TeamRunCloudOperation } from '../../shared/teamrun-cloud-operations'
import type { TeamRunApiClient } from './teamrun-api-client'

const idSchema = z.uuid()
export type TeamRunTaskOperation = Extract<TeamRunCloudOperation, `tasks.${string}`>

export function invokeTeamRunTaskOperation(
  client: TeamRunApiClient,
  operation: TeamRunTaskOperation,
  args: unknown
): Promise<unknown> {
  switch (operation) {
    case 'tasks.list':
      return client.request(`/v1/projects/${idSchema.parse(args)}/tasks`)
    case 'tasks.get':
      return client.request(`/v1/tasks/${idSchema.parse(args)}`)
    case 'tasks.create': {
      const parsed = z.object({ projectId: idSchema, task: createTaskRequestSchema }).parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/tasks`, {
        method: 'POST',
        body: parsed.task
      })
    }
    case 'tasks.update': {
      const parsed = z.object({ taskId: idSchema, changes: updateTaskRequestSchema }).parse(args)
      return client.request(`/v1/tasks/${parsed.taskId}`, {
        method: 'PATCH',
        body: parsed.changes
      })
    }
    case 'tasks.listComments':
      return client.request(`/v1/tasks/${idSchema.parse(args)}/comments`)
    case 'tasks.createComment': {
      const parsed = z
        .object({ taskId: idSchema, comment: createTaskCommentRequestSchema })
        .parse(args)
      return client.request(`/v1/tasks/${parsed.taskId}/comments`, {
        method: 'POST',
        body: parsed.comment
      })
    }
    case 'tasks.listSnapshots':
      return client.request(`/v1/tasks/${idSchema.parse(args)}/context-snapshots`)
    case 'tasks.createSnapshot': {
      const parsed = z
        .object({ taskId: idSchema, snapshot: createContextSnapshotRequestSchema })
        .parse(args)
      return client.request(`/v1/tasks/${parsed.taskId}/context-snapshots`, {
        method: 'POST',
        body: parsed.snapshot
      })
    }
  }
}

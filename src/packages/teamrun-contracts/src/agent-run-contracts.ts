import { z } from 'zod'
import { entityIdSchema, gitObjectIdSchema, timestampSchema } from './scalars.js'
import { teamAgentSnapshotSchema } from './collaboration-contracts.js'

export const agentRunStatusSchema = z.enum([
  'queued',
  'starting',
  'working',
  'needs_input',
  'review',
  'completed',
  'failed',
  'canceled'
])

export const workspaceRevisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('git'), objectId: gitObjectIdSchema }),
  z.object({ kind: z.literal('folder'), contextHash: z.string().regex(/^[a-f0-9]{64}$/) })
])

export const agentRunSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  taskId: entityIdSchema,
  contextSnapshotId: entityIdSchema,
  ownerUserId: entityIdSchema,
  agentKind: z.string().min(1).max(80),
  teamAgentSnapshot: teamAgentSnapshotSchema.nullable(),
  status: agentRunStatusSchema,
  stale: z.boolean(),
  baseRevision: workspaceRevisionSchema,
  clientRunId: z.string().min(1).max(160),
  lastSequence: z.number().int().nonnegative(),
  lastHeartbeatAt: timestampSchema.nullable(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const createAgentRunRequestSchema = z.object({
  contextSnapshotId: entityIdSchema,
  agentKind: z.string().min(1).max(80),
  teamAgentId: entityIdSchema.optional(),
  baseRevision: workspaceRevisionSchema,
  clientRunId: z.string().min(1).max(160)
})

export const updateAgentRunStatusRequestSchema = z.object({
  sequence: z.number().int().positive(),
  status: agentRunStatusSchema,
  heartbeatAt: timestampSchema,
  failureCode: z.string().min(1).max(120).optional()
})

export const teamRunWorkspaceLinkSchema = z.object({
  version: z.literal(1),
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  taskId: entityIdSchema,
  contextSnapshotId: entityIdSchema,
  agentRunId: entityIdSchema
})

export const TEAM_TASK_LINKS_CAPABILITY = 'teamTaskLinksV1' as const

export type AgentRun = z.infer<typeof agentRunSchema>
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>
export type TeamRunWorkspaceLink = z.infer<typeof teamRunWorkspaceLinkSchema>
export type WorkspaceRevision = z.infer<typeof workspaceRevisionSchema>
export type CreateAgentRunRequest = z.infer<typeof createAgentRunRequestSchema>
export type UpdateAgentRunStatusRequest = z.infer<typeof updateAgentRunStatusRequestSchema>

import { z } from 'zod'
import { entityIdSchema, timestampSchema } from './scalars.js'

export const teamEventTypeSchema = z.enum([
  'organization.invitation_created',
  'organization.membership_changed',
  'project.created',
  'project.updated',
  'channel.created',
  'channel.message_created',
  'team_agent.created',
  'task.created',
  'task.updated',
  'task.comment.created',
  'context_snapshot.created',
  'agent_run.created',
  'agent_run.status_updated',
  'publication.finalized'
])

export const teamEventSchema = z.object({
  cursor: z.number().int().nonnegative(),
  organizationId: entityIdSchema,
  type: teamEventTypeSchema,
  entityId: entityIdSchema,
  actorUserId: entityIdSchema,
  occurredAt: timestampSchema,
  data: z.record(z.string(), z.unknown())
})

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
})

export type TeamEvent = z.infer<typeof teamEventSchema>
export type TeamEventType = z.infer<typeof teamEventTypeSchema>

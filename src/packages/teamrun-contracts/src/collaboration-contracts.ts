import { z } from 'zod'
import { entityIdSchema, markdownSchema, timestampSchema, versionSchema } from './scalars.js'

export const channelSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  description: z.string().max(500),
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const channelMessageSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  channelId: entityIdSchema,
  authorUserId: entityIdSchema,
  authorTeamAgentId: entityIdSchema.nullable().default(null),
  bodyMarkdown: markdownSchema.min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const teamAgentSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  name: z.string().min(1).max(160),
  agentKind: z.string().min(1).max(80),
  launchCommand: z.string().trim().min(1).max(2048).nullable().optional(),
  instructionsMarkdown: markdownSchema,
  version: versionSchema,
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const teamAgentSnapshotSchema = teamAgentSchema.pick({
  id: true,
  name: true,
  agentKind: true,
  launchCommand: true,
  instructionsMarkdown: true,
  version: true
})

export const createChannelRequestSchema = channelSchema.pick({
  name: true,
  description: true
})
export const createChannelMessageRequestSchema = channelMessageSchema.pick({ bodyMarkdown: true })
export const createAgentChannelMessageRequestSchema = z.object({
  bodyMarkdown: markdownSchema.min(1),
  authorTeamAgentId: entityIdSchema
})
export const createTeamAgentRequestSchema = teamAgentSchema
  .pick({
    name: true,
    agentKind: true,
    launchCommand: true,
    instructionsMarkdown: true
  })
  .superRefine((value, context) => {
    if (value.agentKind === 'generic-cli' && !value.launchCommand) {
      context.addIssue({
        code: 'custom',
        path: ['launchCommand'],
        message: 'Generic CLI Team Agents require a launch command'
      })
    }
  })

export type Channel = z.infer<typeof channelSchema>
export type ChannelMessage = z.infer<typeof channelMessageSchema>
export type TeamAgent = z.infer<typeof teamAgentSchema>
export type TeamAgentSnapshot = z.infer<typeof teamAgentSnapshotSchema>
export type CreateChannelRequest = z.infer<typeof createChannelRequestSchema>
export type CreateChannelMessageRequest = z.infer<typeof createChannelMessageRequestSchema>
export type CreateAgentChannelMessageRequest = z.infer<
  typeof createAgentChannelMessageRequestSchema
>
export type CreateTeamAgentRequest = z.infer<typeof createTeamAgentRequestSchema>

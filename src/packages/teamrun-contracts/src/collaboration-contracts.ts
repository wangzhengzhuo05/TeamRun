import { z } from 'zod'
import { entityIdSchema, markdownSchema, timestampSchema, versionSchema } from './scalars.js'

const teamServerBaseUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return (
      url.username === '' &&
      url.password === '' &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
  }, 'Base URL must use HTTPS, or HTTP on loopback')

export const teamServerBindingSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  name: z.string().min(1).max(160),
  endpoint: z.string().min(1).max(2048),
  runtimeId: z.string().min(1).max(160),
  pairedDeviceId: z.string().min(1).max(160).nullable(),
  version: versionSchema,
  enrolledByUserId: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const modelConnectionSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  name: z.string().min(1).max(160),
  baseUrl: teamServerBaseUrlSchema,
  model: z.string().trim().min(1).max(200),
  keyConfigured: z.boolean(),
  version: versionSchema,
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

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
  modelConnectionId: entityIdSchema.nullable().optional(),
  yoloMode: z.boolean().optional(),
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
  modelConnectionId: true,
  yoloMode: true,
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
export const requestTeamAgentReplySchema = z
  .object({
    teamAgentId: entityIdSchema
  })
  .strict()
export const enrollTeamServerRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  pairingCode: z.string().trim().min(1).max(16_384)
})
export const createModelConnectionRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  baseUrl: teamServerBaseUrlSchema,
  apiKey: z.string().trim().min(1).max(4096),
  model: z.string().trim().min(1).max(200)
})
export const createTeamAgentRequestSchema = teamAgentSchema
  .pick({
    name: true,
    agentKind: true,
    launchCommand: true,
    modelConnectionId: true,
    yoloMode: true,
    instructionsMarkdown: true
  })
  .superRefine((value, context) => {
    if (value.agentKind !== 'opencode') {
      context.addIssue({
        code: 'custom',
        path: ['agentKind'],
        message: 'New Team Agents must use OpenCode on the Team Server'
      })
    }
    if (!value.modelConnectionId) {
      context.addIssue({
        code: 'custom',
        path: ['modelConnectionId'],
        message: 'Team Agents require a Model Connection'
      })
    }
  })

export type Channel = z.infer<typeof channelSchema>
export type ChannelMessage = z.infer<typeof channelMessageSchema>
export type TeamServerBinding = z.infer<typeof teamServerBindingSchema>
export type ModelConnection = z.infer<typeof modelConnectionSchema>
export type TeamAgent = z.infer<typeof teamAgentSchema>
export type TeamAgentSnapshot = z.infer<typeof teamAgentSnapshotSchema>
export type CreateChannelRequest = z.infer<typeof createChannelRequestSchema>
export type CreateChannelMessageRequest = z.infer<typeof createChannelMessageRequestSchema>
export type CreateAgentChannelMessageRequest = z.infer<
  typeof createAgentChannelMessageRequestSchema
>
export type RequestTeamAgentReply = z.infer<typeof requestTeamAgentReplySchema>
export type EnrollTeamServerRequest = z.infer<typeof enrollTeamServerRequestSchema>
export type CreateModelConnectionRequest = z.infer<typeof createModelConnectionRequestSchema>
export type CreateTeamAgentRequest = z.infer<typeof createTeamAgentRequestSchema>

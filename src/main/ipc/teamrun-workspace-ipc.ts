import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  createChannelMessageRequestSchema,
  createChannelRequestSchema,
  createProjectRequestSchema,
  createRepositoryRequestSchema,
  createTeamAgentRequestSchema,
  updateProjectRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { TeamAgentChatService } from '../teamrun/team-agent-chat-service'
import {
  hasTeamAgentCredential,
  saveTeamAgentCredential
} from '../teamrun/team-agent-credential-store'
import type { TeamRunApiClient } from '../teamrun/teamrun-api-client'

const idSchema = z.uuid()

function pathId(value: unknown): string {
  return idSchema.parse(value)
}

export function registerTeamRunWorkspaceHandlers(
  client: TeamRunApiClient,
  agentChat: TeamAgentChatService
): void {
  ipcMain.handle('teamrun:organizations:list', () => client.request('/v1/organizations'))
  ipcMain.handle('teamrun:organizations:create', (_event, args) => {
    const body = z
      .object({
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
        name: z.string().min(1).max(160)
      })
      .parse(args)
    return client.request('/v1/organizations', { method: 'POST', body })
  })
  ipcMain.handle('teamrun:organizations:listMembers', (_event, organizationId) =>
    client.request(`/v1/organizations/${pathId(organizationId)}/members`)
  )
  ipcMain.handle('teamrun:organizations:addMember', (_event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, email: z.email(), role: z.enum(['admin', 'member']) })
      .parse(args)
    return client.request(`/v1/organizations/${parsed.organizationId}/members`, {
      method: 'POST',
      body: { email: parsed.email, role: parsed.role }
    })
  })
  ipcMain.handle('teamrun:organizations:removeMember', (_event, args) => {
    const parsed = z.object({ organizationId: idSchema, userId: idSchema }).parse(args)
    return client.request(`/v1/organizations/${parsed.organizationId}/members/${parsed.userId}`, {
      method: 'DELETE'
    })
  })
  ipcMain.handle('teamrun:organizations:listInvitations', (_event, organizationId) =>
    client.request(`/v1/organizations/${pathId(organizationId)}/invitations`)
  )
  ipcMain.handle('teamrun:organizations:invite', (_event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, email: z.email(), role: z.enum(['admin', 'member']) })
      .parse(args)
    return client.request(`/v1/organizations/${parsed.organizationId}/invitations`, {
      method: 'POST',
      body: { email: parsed.email, role: parsed.role }
    })
  })
  ipcMain.handle('teamrun:organizations:revokeInvitation', (_event, args) => {
    const parsed = z.object({ organizationId: idSchema, invitationId: idSchema }).parse(args)
    return client.request(
      `/v1/organizations/${parsed.organizationId}/invitations/${parsed.invitationId}`,
      { method: 'DELETE' }
    )
  })

  ipcMain.handle('teamrun:projects:list', (_event, organizationId) =>
    client.request(`/v1/organizations/${pathId(organizationId)}/projects`)
  )
  ipcMain.handle('teamrun:projects:create', (_event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, project: createProjectRequestSchema })
      .parse(args)
    return client.request(`/v1/organizations/${parsed.organizationId}/projects`, {
      method: 'POST',
      body: parsed.project
    })
  })
  ipcMain.handle('teamrun:projects:update', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, changes: updateProjectRequestSchema })
      .parse(args)
    return client.request(`/v1/projects/${parsed.projectId}`, {
      method: 'PATCH',
      body: parsed.changes
    })
  })
  ipcMain.handle('teamrun:repositories:list', (_event, projectId) =>
    client.request(`/v1/projects/${pathId(projectId)}/repositories`)
  )
  ipcMain.handle('teamrun:repositories:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, repository: createRepositoryRequestSchema })
      .parse(args)
    return client.request(`/v1/projects/${parsed.projectId}/repositories`, {
      method: 'POST',
      body: parsed.repository
    })
  })

  ipcMain.handle('teamrun:channels:list', (_event, projectId) =>
    client.request(`/v1/projects/${pathId(projectId)}/channels`)
  )
  ipcMain.handle('teamrun:channels:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, channel: createChannelRequestSchema })
      .parse(args)
    return client.request(`/v1/projects/${parsed.projectId}/channels`, {
      method: 'POST',
      body: parsed.channel
    })
  })
  ipcMain.handle('teamrun:channels:listMessages', (_event, channelId) =>
    client.request(`/v1/channels/${pathId(channelId)}/messages`)
  )
  ipcMain.handle('teamrun:channels:createMessage', (_event, args) => {
    const parsed = z
      .object({ channelId: idSchema, message: createChannelMessageRequestSchema })
      .parse(args)
    return client.request(`/v1/channels/${parsed.channelId}/messages`, {
      method: 'POST',
      body: parsed.message
    })
  })
  ipcMain.handle('teamrun:teamAgents:list', (_event, projectId) =>
    client.request(`/v1/projects/${pathId(projectId)}/team-agents`)
  )
  ipcMain.handle('teamrun:teamAgents:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, teamAgent: createTeamAgentRequestSchema })
      .parse(args)
    return client.request(`/v1/projects/${parsed.projectId}/team-agents`, {
      method: 'POST',
      body: parsed.teamAgent
    })
  })
  ipcMain.handle('teamrun:teamAgents:credentialStatus', (_event, agentId) => ({
    configured: hasTeamAgentCredential(pathId(agentId))
  }))
  ipcMain.handle('teamrun:teamAgents:saveCredential', (_event, args) => {
    const parsed = z.object({ agentId: idSchema, apiKey: z.string().max(1024) }).parse(args)
    saveTeamAgentCredential(parsed.agentId, parsed.apiKey)
    return { configured: true }
  })
  ipcMain.handle('teamrun:teamAgents:reply', (_event, args) => {
    const parsed = z
      .object({
        projectId: idSchema,
        channelId: idSchema,
        teamAgentId: idSchema,
        bodyMarkdown: z.string().trim().min(1).max(32_000)
      })
      .parse(args)
    return agentChat.reply(parsed)
  })
}

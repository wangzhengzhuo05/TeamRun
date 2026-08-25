import { app, ipcMain } from 'electron'
import { z } from 'zod'
import {
  createAgentRunRequestSchema,
  createChannelMessageRequestSchema,
  createChannelRequestSchema,
  createContextSnapshotRequestSchema,
  createProjectRequestSchema,
  createRepositoryRequestSchema,
  createTaskCommentRequestSchema,
  createTaskRequestSchema,
  createTeamAgentRequestSchema,
  finalizePublicationRequestSchema,
  preparePublicationRequestSchema,
  updateAgentRunStatusRequestSchema,
  updateProjectRequestSchema,
  updateTaskRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { AgentRun } from '../../packages/teamrun-contracts/src/index'
import { TeamRunApiClient } from '../teamrun/teamrun-api-client'
import { TeamRunVerificationService } from '../teamrun/teamrun-verification-service'
import { TeamRunPublicationService } from '../teamrun/teamrun-publication-service'
import { TeamRunWorkspaceReviewService } from '../teamrun/teamrun-workspace-review-service'
import { TeamRunEventClient } from '../teamrun/teamrun-event-client'
import type { Store } from '../persistence'

const idSchema = z.uuid()
const teamRunClient = new TeamRunApiClient()

function pathId(value: unknown): string {
  return idSchema.parse(value)
}

export function registerTeamRunHandlers(store: Store): void {
  const userDataPath = app.getPath('userData')
  const verification = new TeamRunVerificationService(store, teamRunClient, userDataPath)
  const publication = new TeamRunPublicationService(store, teamRunClient, userDataPath)
  const workspaceReview = new TeamRunWorkspaceReviewService(store, teamRunClient, userDataPath)
  const events = new TeamRunEventClient(teamRunClient)
  ipcMain.handle('teamrun:authStatus', () => teamRunClient.auth.status())
  ipcMain.handle('teamrun:signIn', (_event, args?: { devEmail?: string }) =>
    teamRunClient.auth.signIn(args)
  )
  ipcMain.handle('teamrun:signOut', () => teamRunClient.auth.signOut())
  ipcMain.handle('teamrun:sync:status', () => teamRunClient.syncStatus())
  ipcMain.handle('teamrun:sync:flush', async () => {
    await teamRunClient.flushPending()
    return teamRunClient.syncStatus()
  })

  ipcMain.handle('teamrun:organizations:list', () => teamRunClient.request('/v1/organizations'))
  ipcMain.handle('teamrun:organizations:create', (_event, args) => {
    const body = z
      .object({
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
        name: z.string().min(1).max(160)
      })
      .parse(args)
    return teamRunClient.request('/v1/organizations', { method: 'POST', body })
  })
  ipcMain.handle('teamrun:organizations:listMembers', (_event, organizationId) =>
    teamRunClient.request(`/v1/organizations/${pathId(organizationId)}/members`)
  )
  ipcMain.handle('teamrun:organizations:addMember', (_event, args) => {
    const parsed = z
      .object({
        organizationId: idSchema,
        email: z.email(),
        role: z.enum(['admin', 'member'])
      })
      .parse(args)
    return teamRunClient.request(`/v1/organizations/${parsed.organizationId}/members`, {
      method: 'POST',
      body: { email: parsed.email, role: parsed.role }
    })
  })
  ipcMain.handle('teamrun:organizations:removeMember', (_event, args) => {
    const parsed = z.object({ organizationId: idSchema, userId: idSchema }).parse(args)
    return teamRunClient.request(
      `/v1/organizations/${parsed.organizationId}/members/${parsed.userId}`,
      { method: 'DELETE' }
    )
  })
  ipcMain.handle('teamrun:organizations:listInvitations', (_event, organizationId) =>
    teamRunClient.request(`/v1/organizations/${pathId(organizationId)}/invitations`)
  )
  ipcMain.handle('teamrun:organizations:invite', (_event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, email: z.email(), role: z.enum(['admin', 'member']) })
      .parse(args)
    return teamRunClient.request(`/v1/organizations/${parsed.organizationId}/invitations`, {
      method: 'POST',
      body: { email: parsed.email, role: parsed.role }
    })
  })
  ipcMain.handle('teamrun:organizations:revokeInvitation', (_event, args) => {
    const parsed = z.object({ organizationId: idSchema, invitationId: idSchema }).parse(args)
    return teamRunClient.request(
      `/v1/organizations/${parsed.organizationId}/invitations/${parsed.invitationId}`,
      { method: 'DELETE' }
    )
  })

  ipcMain.handle('teamrun:projects:list', (_event, organizationId) =>
    teamRunClient.request(`/v1/organizations/${pathId(organizationId)}/projects`)
  )
  ipcMain.handle('teamrun:projects:create', (_event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, project: createProjectRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/organizations/${parsed.organizationId}/projects`, {
      method: 'POST',
      body: parsed.project
    })
  })
  ipcMain.handle('teamrun:projects:update', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, changes: updateProjectRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/projects/${parsed.projectId}`, {
      method: 'PATCH',
      body: parsed.changes
    })
  })
  ipcMain.handle('teamrun:repositories:list', (_event, projectId) =>
    teamRunClient.request(`/v1/projects/${pathId(projectId)}/repositories`)
  )
  ipcMain.handle('teamrun:repositories:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, repository: createRepositoryRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/projects/${parsed.projectId}/repositories`, {
      method: 'POST',
      body: parsed.repository
    })
  })

  ipcMain.handle('teamrun:channels:list', (_event, projectId) =>
    teamRunClient.request(`/v1/projects/${pathId(projectId)}/channels`)
  )
  ipcMain.handle('teamrun:channels:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, channel: createChannelRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/projects/${parsed.projectId}/channels`, {
      method: 'POST',
      body: parsed.channel
    })
  })
  ipcMain.handle('teamrun:channels:listMessages', (_event, channelId) =>
    teamRunClient.request(`/v1/channels/${pathId(channelId)}/messages`)
  )
  ipcMain.handle('teamrun:channels:createMessage', (_event, args) => {
    const parsed = z
      .object({ channelId: idSchema, message: createChannelMessageRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/channels/${parsed.channelId}/messages`, {
      method: 'POST',
      body: parsed.message
    })
  })
  ipcMain.handle('teamrun:teamAgents:list', (_event, projectId) =>
    teamRunClient.request(`/v1/projects/${pathId(projectId)}/team-agents`)
  )
  ipcMain.handle('teamrun:teamAgents:create', (_event, args) => {
    const parsed = z
      .object({ projectId: idSchema, teamAgent: createTeamAgentRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/projects/${parsed.projectId}/team-agents`, {
      method: 'POST',
      body: parsed.teamAgent
    })
  })

  ipcMain.handle('teamrun:tasks:list', (_event, projectId) =>
    teamRunClient.request(`/v1/projects/${pathId(projectId)}/tasks`)
  )
  ipcMain.handle('teamrun:tasks:get', (_event, taskId) =>
    teamRunClient.request(`/v1/tasks/${pathId(taskId)}`)
  )
  ipcMain.handle('teamrun:tasks:create', (_event, args) => {
    const parsed = z.object({ projectId: idSchema, task: createTaskRequestSchema }).parse(args)
    return teamRunClient.request(`/v1/projects/${parsed.projectId}/tasks`, {
      method: 'POST',
      body: parsed.task
    })
  })
  ipcMain.handle('teamrun:tasks:update', (_event, args) => {
    const parsed = z.object({ taskId: idSchema, changes: updateTaskRequestSchema }).parse(args)
    return teamRunClient.request(`/v1/tasks/${parsed.taskId}`, {
      method: 'PATCH',
      body: parsed.changes
    })
  })
  ipcMain.handle('teamrun:comments:list', (_event, taskId) =>
    teamRunClient.request(`/v1/tasks/${pathId(taskId)}/comments`)
  )
  ipcMain.handle('teamrun:comments:create', (_event, args) => {
    const parsed = z
      .object({ taskId: idSchema, comment: createTaskCommentRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/tasks/${parsed.taskId}/comments`, {
      method: 'POST',
      body: parsed.comment
    })
  })
  ipcMain.handle('teamrun:snapshots:list', (_event, taskId) =>
    teamRunClient.request(`/v1/tasks/${pathId(taskId)}/context-snapshots`)
  )
  ipcMain.handle('teamrun:snapshots:create', (_event, args) => {
    const parsed = z
      .object({ taskId: idSchema, snapshot: createContextSnapshotRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/tasks/${parsed.taskId}/context-snapshots`, {
      method: 'POST',
      body: parsed.snapshot
    })
  })

  ipcMain.handle('teamrun:runs:list', (_event, taskId) =>
    teamRunClient.request(`/v1/tasks/${pathId(taskId)}/agent-runs`)
  )
  ipcMain.handle('teamrun:runs:create', (_event, args) => {
    const parsed = z.object({ taskId: idSchema, run: createAgentRunRequestSchema }).parse(args)
    return teamRunClient.request(`/v1/tasks/${parsed.taskId}/agent-runs`, {
      method: 'POST',
      body: parsed.run
    })
  })
  ipcMain.handle('teamrun:runs:createLinked', async (_event, args) => {
    const parsed = z
      .object({
        taskId: idSchema,
        run: createAgentRunRequestSchema,
        workspaceId: z.string().min(1).max(4096),
        workspacePath: z.string().min(1).max(32_768)
      })
      .parse(args)
    const run = await teamRunClient.request<AgentRun>(`/v1/tasks/${parsed.taskId}/agent-runs`, {
      method: 'POST',
      body: parsed.run,
      queueIfOffline: false
    })
    teamRunClient.putWorkspaceLink({
      clientRunId: parsed.run.clientRunId,
      agentRunId: run.id,
      workspaceId: parsed.workspaceId,
      workspacePath: parsed.workspacePath,
      taskId: parsed.taskId,
      baseRevision: parsed.run.baseRevision
    })
    return run
  })
  ipcMain.handle('teamrun:runs:resolveWorkspace', (_event, clientRunId) =>
    teamRunClient.getWorkspaceLink(z.string().min(1).max(160).parse(clientRunId))
  )
  ipcMain.handle('teamrun:runs:reviewWorkspace', (_event, args) =>
    workspaceReview.read(
      z.object({ runId: idSchema, clientRunId: z.string().min(1).max(160) }).parse(args)
    )
  )
  ipcMain.handle('teamrun:runs:updateStatus', (_event, args) => {
    const parsed = z
      .object({ runId: idSchema, status: updateAgentRunStatusRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/agent-runs/${parsed.runId}/status`, {
      method: 'PATCH',
      body: parsed.status
    })
  })
  ipcMain.handle('teamrun:verifications:list', (_event, runId) =>
    teamRunClient.listVerifications(pathId(runId))
  )
  ipcMain.handle('teamrun:verifications:listCommands', (_event, clientRunId) =>
    verification.listCommands(z.string().min(1).max(160).parse(clientRunId))
  )
  ipcMain.handle('teamrun:verifications:run', (_event, args) =>
    verification.run(
      z
        .object({
          runId: idSchema,
          clientRunId: z.string().min(1).max(160),
          commandId: z.string().min(1).max(64)
        })
        .parse(args)
    )
  )

  ipcMain.handle('teamrun:publications:list', (_event, taskId) =>
    teamRunClient.request(`/v1/tasks/${pathId(taskId)}/publications`)
  )
  ipcMain.handle('teamrun:publications:listArtifacts', (_event, publicationId) =>
    teamRunClient.request(`/v1/publications/${pathId(publicationId)}/artifacts`, { cache: false })
  )
  ipcMain.handle('teamrun:publications:prepare', (_event, args) =>
    teamRunClient.request('/v1/publications/prepare', {
      method: 'POST',
      body: preparePublicationRequestSchema.parse(args)
    })
  )
  ipcMain.handle('teamrun:publications:finalize', (_event, args) => {
    const parsed = z
      .object({ publicationId: idSchema, request: finalizePublicationRequestSchema })
      .parse(args)
    return teamRunClient.request(`/v1/publications/${parsed.publicationId}/finalize`, {
      method: 'POST',
      body: parsed.request
    })
  })
  ipcMain.handle('teamrun:publications:publishSelected', (_event, args) =>
    publication.publish(
      z
        .object({
          runId: idSchema,
          clientRunId: z.string().min(1).max(160),
          summaryMarkdown: z.string().max(200_000),
          reviewUrl: z.url().nullable().optional(),
          includeDiff: z.boolean(),
          includeVerificationOutput: z.boolean()
        })
        .parse(args)
    )
  )
  ipcMain.handle('teamrun:events:start', (event, args) => {
    const parsed = z
      .object({ organizationId: idSchema, cursor: z.number().int().nonnegative().optional() })
      .parse(args)
    events.start(event.sender, parsed.organizationId, parsed.cursor)
  })
  ipcMain.handle('teamrun:events:stop', (event) => events.stop(event.sender.id))
}

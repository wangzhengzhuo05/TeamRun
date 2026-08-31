import { app, ipcMain } from 'electron'
import { z } from 'zod'
import {
  createAgentRunRequestSchema,
  createContextSnapshotRequestSchema,
  createTaskCommentRequestSchema,
  createTaskRequestSchema,
  finalizePublicationRequestSchema,
  preparePublicationRequestSchema,
  updateAgentRunStatusRequestSchema,
  updateTaskRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { AgentRun } from '../../packages/teamrun-contracts/src/index'
import { TeamRunApiClient } from '../teamrun/teamrun-api-client'
import { TeamRunVerificationService } from '../teamrun/teamrun-verification-service'
import { TeamRunPublicationService } from '../teamrun/teamrun-publication-service'
import { TeamRunWorkspaceReviewService } from '../teamrun/teamrun-workspace-review-service'
import { TeamRunEventClient } from '../teamrun/teamrun-event-client'
import { TeamAgentChatService } from '../teamrun/team-agent-chat-service'
import { registerTeamRunWorkspaceHandlers } from './teamrun-workspace-ipc'
import type { Store } from '../persistence'

const idSchema = z.uuid()
const signInSchema = z
  .object({
    apiUrl: z.string().max(2048).optional(),
    sharedKey: z.string().max(1024).optional(),
    devEmail: z.email().optional()
  })
  .optional()
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
  const agentChat = new TeamAgentChatService(teamRunClient)
  ipcMain.handle('teamrun:authStatus', () => teamRunClient.auth.status())
  ipcMain.handle('teamrun:signIn', (_event, args) =>
    teamRunClient.auth.signIn(signInSchema.parse(args))
  )
  ipcMain.handle('teamrun:signOut', () => teamRunClient.auth.signOut())
  ipcMain.handle('teamrun:sync:status', () => teamRunClient.syncStatus())
  ipcMain.handle('teamrun:sync:flush', async () => {
    await teamRunClient.flushPending()
    return teamRunClient.syncStatus()
  })

  registerTeamRunWorkspaceHandlers(teamRunClient, agentChat)

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

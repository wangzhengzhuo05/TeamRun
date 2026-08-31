import { z } from 'zod'
import {
  createAgentRunRequestSchema,
  createContextSnapshotRequestSchema,
  createProjectRequestSchema,
  createRepositoryRequestSchema,
  createTaskCommentRequestSchema,
  createTaskRequestSchema,
  finalizePublicationRequestSchema,
  preparePublicationRequestSchema,
  updateAgentRunStatusRequestSchema,
  updateProjectRequestSchema,
  updateTaskRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { TeamRunCloudOperation } from '../../shared/teamrun-cloud-operations'
import type { Store } from '../persistence'
import { TeamRunApiClient } from './teamrun-api-client'
import { TeamRunPublicationService } from './teamrun-publication-service'
import { TeamRunVerificationService } from './teamrun-verification-service'
import { TeamRunWorkspaceReviewService } from './teamrun-workspace-review-service'
import { TeamAgentChatService } from './team-agent-chat-service'
import { invokeTeamRunCollaborationOperation } from './teamrun-collaboration-command'
import { createLinkedTeamRun } from './teamrun-linked-run-command'

const idSchema = z.uuid()
const textIdSchema = z.string().min(1).max(160)
const signInSchema = z
  .object({
    apiUrl: z.string().max(2048).optional(),
    sharedKey: z.string().max(1024).optional(),
    devEmail: z.email().optional()
  })
  .optional()

export class TeamRunCloudCommandService {
  readonly client: TeamRunApiClient
  readonly #verification: TeamRunVerificationService
  readonly #publication: TeamRunPublicationService
  readonly #workspaceReview: TeamRunWorkspaceReviewService
  readonly #agentChat: TeamAgentChatService

  constructor(store: Store, userDataPath: string, client = new TeamRunApiClient()) {
    this.client = client
    this.#verification = new TeamRunVerificationService(store, client, userDataPath)
    this.#publication = new TeamRunPublicationService(store, client, userDataPath)
    this.#workspaceReview = new TeamRunWorkspaceReviewService(store, client, userDataPath)
    this.#agentChat = new TeamAgentChatService(client)
  }

  async invoke(operation: TeamRunCloudOperation, args?: unknown): Promise<unknown> {
    switch (operation) {
      case 'auth.status':
        return this.client.auth.status()
      case 'auth.signIn':
        return this.client.auth.signIn(signInSchema.parse(args))
      case 'auth.signOut':
        return this.client.auth.signOut()
      case 'sync.status':
        return this.client.syncStatus()
      case 'sync.flush':
        await this.client.flushPending()
        return this.client.syncStatus()
      case 'organizations.list':
        return this.client.request('/v1/organizations')
      case 'organizations.create': {
        const body = z
          .object({
            slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
            name: z.string().min(1).max(160)
          })
          .parse(args)
        return this.client.request('/v1/organizations', { method: 'POST', body })
      }
      case 'organizations.listMembers':
        return this.client.request(`/v1/organizations/${idSchema.parse(args)}/members`)
      case 'organizations.addMember': {
        const parsed = z
          .object({ organizationId: idSchema, email: z.email(), role: z.enum(['admin', 'member']) })
          .parse(args)
        return this.client.request(`/v1/organizations/${parsed.organizationId}/members`, {
          method: 'POST',
          body: { email: parsed.email, role: parsed.role }
        })
      }
      case 'organizations.removeMember': {
        const parsed = z.object({ organizationId: idSchema, userId: idSchema }).parse(args)
        return this.client.request(
          `/v1/organizations/${parsed.organizationId}/members/${parsed.userId}`,
          { method: 'DELETE' }
        )
      }
      case 'organizations.updateMemberRole': {
        const parsed = z
          .object({
            organizationId: idSchema,
            userId: idSchema,
            role: z.enum(['admin', 'member'])
          })
          .parse(args)
        return this.client.request(
          `/v1/organizations/${parsed.organizationId}/members/${parsed.userId}`,
          { method: 'PATCH', body: { role: parsed.role } }
        )
      }
      case 'organizations.listInviteCodes':
        return this.client.request(`/v1/organizations/${idSchema.parse(args)}/invite-codes`)
      case 'organizations.createInviteCode':
        return this.client.request(`/v1/organizations/${idSchema.parse(args)}/invite-codes`, {
          method: 'POST',
          body: {}
        })
      case 'organizations.revokeInviteCode': {
        const parsed = z.object({ organizationId: idSchema, inviteCodeId: idSchema }).parse(args)
        return this.client.request(
          `/v1/organizations/${parsed.organizationId}/invite-codes/${parsed.inviteCodeId}`,
          { method: 'DELETE' }
        )
      }
      case 'organizations.redeemInviteCode':
        return this.client.request('/v1/team-invite-codes/redeem', {
          method: 'POST',
          body: { code: z.string().min(1).max(128).parse(args) }
        })
      case 'organizations.listInvitations':
        return this.client.request(`/v1/organizations/${idSchema.parse(args)}/invitations`)
      case 'organizations.invite': {
        const parsed = z
          .object({ organizationId: idSchema, email: z.email(), role: z.enum(['admin', 'member']) })
          .parse(args)
        return this.client.request(`/v1/organizations/${parsed.organizationId}/invitations`, {
          method: 'POST',
          body: { email: parsed.email, role: parsed.role }
        })
      }
      case 'organizations.revokeInvitation': {
        const parsed = z.object({ organizationId: idSchema, invitationId: idSchema }).parse(args)
        return this.client.request(
          `/v1/organizations/${parsed.organizationId}/invitations/${parsed.invitationId}`,
          { method: 'DELETE' }
        )
      }
      case 'projects.list':
        return this.client.request(`/v1/organizations/${idSchema.parse(args)}/projects`)
      case 'projects.create': {
        const parsed = z
          .object({ organizationId: idSchema, project: createProjectRequestSchema })
          .parse(args)
        return this.client.request(`/v1/organizations/${parsed.organizationId}/projects`, {
          method: 'POST',
          body: parsed.project
        })
      }
      case 'projects.update': {
        const parsed = z
          .object({ projectId: idSchema, changes: updateProjectRequestSchema })
          .parse(args)
        return this.client.request(`/v1/projects/${parsed.projectId}`, {
          method: 'PATCH',
          body: parsed.changes
        })
      }
      case 'projects.listRepositories':
        return this.client.request(`/v1/projects/${idSchema.parse(args)}/repositories`)
      case 'projects.createRepository': {
        const parsed = z
          .object({ projectId: idSchema, repository: createRepositoryRequestSchema })
          .parse(args)
        return this.client.request(`/v1/projects/${parsed.projectId}/repositories`, {
          method: 'POST',
          body: parsed.repository
        })
      }
      case 'collaboration.listChannels':
      case 'collaboration.createChannel':
      case 'collaboration.listMessages':
      case 'collaboration.createMessage':
      case 'collaboration.listTeamAgents':
      case 'collaboration.createTeamAgent':
      case 'collaboration.credentialStatus':
      case 'collaboration.saveCredential':
      case 'collaboration.reply':
        return invokeTeamRunCollaborationOperation(this.client, this.#agentChat, operation, args)
      case 'tasks.list':
        return this.client.request(`/v1/projects/${idSchema.parse(args)}/tasks`)
      case 'tasks.get':
        return this.client.request(`/v1/tasks/${idSchema.parse(args)}`)
      case 'tasks.create': {
        const parsed = z.object({ projectId: idSchema, task: createTaskRequestSchema }).parse(args)
        return this.client.request(`/v1/projects/${parsed.projectId}/tasks`, {
          method: 'POST',
          body: parsed.task
        })
      }
      case 'tasks.update': {
        const parsed = z.object({ taskId: idSchema, changes: updateTaskRequestSchema }).parse(args)
        return this.client.request(`/v1/tasks/${parsed.taskId}`, {
          method: 'PATCH',
          body: parsed.changes
        })
      }
      case 'tasks.listComments':
        return this.client.request(`/v1/tasks/${idSchema.parse(args)}/comments`)
      case 'tasks.createComment': {
        const parsed = z
          .object({ taskId: idSchema, comment: createTaskCommentRequestSchema })
          .parse(args)
        return this.client.request(`/v1/tasks/${parsed.taskId}/comments`, {
          method: 'POST',
          body: parsed.comment
        })
      }
      case 'tasks.listSnapshots':
        return this.client.request(`/v1/tasks/${idSchema.parse(args)}/context-snapshots`)
      case 'tasks.createSnapshot': {
        const parsed = z
          .object({ taskId: idSchema, snapshot: createContextSnapshotRequestSchema })
          .parse(args)
        return this.client.request(`/v1/tasks/${parsed.taskId}/context-snapshots`, {
          method: 'POST',
          body: parsed.snapshot
        })
      }
      case 'runs.list':
        return this.client.request(`/v1/tasks/${idSchema.parse(args)}/agent-runs`)
      case 'runs.create': {
        const parsed = z.object({ taskId: idSchema, run: createAgentRunRequestSchema }).parse(args)
        return this.client.request(`/v1/tasks/${parsed.taskId}/agent-runs`, {
          method: 'POST',
          body: parsed.run
        })
      }
      case 'runs.createLinked':
        return createLinkedTeamRun(this.client, args)
      case 'runs.resolveWorkspace':
        return this.client.getWorkspaceLink(textIdSchema.parse(args))
      case 'runs.reviewWorkspace':
        return this.#workspaceReview.read(
          z.object({ runId: idSchema, clientRunId: textIdSchema }).parse(args)
        )
      case 'runs.updateStatus': {
        const parsed = z
          .object({ runId: idSchema, status: updateAgentRunStatusRequestSchema })
          .parse(args)
        return this.client.request(`/v1/agent-runs/${parsed.runId}/status`, {
          method: 'PATCH',
          body: parsed.status
        })
      }
      case 'runs.listVerifications':
        return this.client.listVerifications(idSchema.parse(args))
      case 'runs.listVerificationCommands':
        return this.#verification.listCommands(textIdSchema.parse(args))
      case 'runs.runVerification':
        return this.#verification.run(
          z
            .object({
              runId: idSchema,
              clientRunId: textIdSchema,
              commandId: z.string().min(1).max(64)
            })
            .parse(args)
        )
      case 'publications.list':
        return this.client.request(`/v1/tasks/${idSchema.parse(args)}/publications`)
      case 'publications.listArtifacts':
        return this.client.request(`/v1/publications/${idSchema.parse(args)}/artifacts`, {
          cache: false
        })
      case 'publications.prepare':
        return this.client.request('/v1/publications/prepare', {
          method: 'POST',
          body: preparePublicationRequestSchema.parse(args)
        })
      case 'publications.finalize': {
        const parsed = z
          .object({ publicationId: idSchema, request: finalizePublicationRequestSchema })
          .parse(args)
        return this.client.request(`/v1/publications/${parsed.publicationId}/finalize`, {
          method: 'POST',
          body: parsed.request
        })
      }
      case 'publications.publishSelected':
        return this.#publication.publish(
          z
            .object({
              runId: idSchema,
              clientRunId: textIdSchema,
              summaryMarkdown: z.string().max(200_000),
              reviewUrl: z.url().nullable().optional(),
              includeDiff: z.boolean(),
              includeVerificationOutput: z.boolean()
            })
            .parse(args)
        )
    }
  }
}

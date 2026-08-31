import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { enrollTeamServerRequestSchema } from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { teamServerBindings } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'
import {
  decryptTeamServerPairing,
  encryptTeamServerPairing
} from '../team-server/team-server-pairing-cipher.js'
import { parseTeamServerPairingCode } from '../team-server/team-server-pairing.js'
import { sendTeamServerRuntimeRequest } from '../team-server/team-server-runtime-client.js'
import { requireProject } from './project-access.js'

type TeamServerStatus = {
  runtimeId: string
  hostPlatform: string
  opencodeAvailable: boolean
  credentialEncryptionAvailable: boolean
}

const publicBinding = {
  id: teamServerBindings.id,
  organizationId: teamServerBindings.organizationId,
  projectId: teamServerBindings.projectId,
  name: teamServerBindings.name,
  endpoint: teamServerBindings.endpoint,
  runtimeId: teamServerBindings.runtimeId,
  pairedDeviceId: teamServerBindings.pairedDeviceId,
  version: teamServerBindings.version,
  enrolledByUserId: teamServerBindings.enrolledByUserId,
  createdAt: teamServerBindings.createdAt,
  updatedAt: teamServerBindings.updatedAt
}

export async function registerTeamServerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects/:projectId/team-server', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await requireProject(app, projectId, request.teamRunUser.id)
    const [binding] = await app.teamRunDatabase
      .select(publicBinding)
      .from(teamServerBindings)
      .where(eq(teamServerBindings.projectId, projectId))
      .limit(1)
    return binding ?? null
  })

  app.post('/v1/projects/:projectId/team-server', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = enrollTeamServerRequestSchema.parse(request.body)
    const project = await requireProject(app, projectId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      project.organizationId,
      request.teamRunUser.id,
      ['owner']
    )
    const [current] = await app.teamRunDatabase
      .select()
      .from(teamServerBindings)
      .where(eq(teamServerBindings.organizationId, project.organizationId))
      .limit(1)
    if (current && current.projectId !== projectId) {
      throw new ApiProblem(
        409,
        'team_server_project_conflict',
        'This Team is already bound to another Project'
      )
    }
    const pairing = parseTeamServerPairingCode(body.pairingCode)
    const status = await sendTeamServerRuntimeRequest<TeamServerStatus>(
      pairing,
      'teamrun.teamServer.status',
      undefined,
      15_000
    )
    requireUsableTeamServer(status)
    const encryptedPairingOffer = encryptTeamServerPairing(app.teamRunConfig, pairing)
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/projects/${projectId}/team-server`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const values = {
          organizationId: project.organizationId,
          projectId,
          name: body.name,
          endpoint: pairing.endpoint,
          runtimeId: status.runtimeId,
          pairedDeviceId: pairing.pairedDeviceId ?? null,
          encryptedPairingOffer,
          enrolledByUserId: request.teamRunUser.id
        }
        const [binding] = current
          ? await transaction
              .update(teamServerBindings)
              .set({
                ...values,
                version: sql`${teamServerBindings.version} + 1`,
                updatedAt: new Date()
              })
              .where(eq(teamServerBindings.id, current.id))
              .returning(publicBinding)
          : await transaction.insert(teamServerBindings).values(values).returning(publicBinding)
        if (!binding) {
          throw new ApiProblem(500, 'team_server_enroll_failed', 'Team Server was not saved')
        }
        await appendTeamEvent(transaction, {
          organizationId: project.organizationId,
          type: current ? 'team_server.replaced' : 'team_server.enrolled',
          entityId: binding.id,
          actorUserId: request.teamRunUser.id,
          data: { projectId, runtimeId: binding.runtimeId }
        })
        return { status: current ? 200 : 201, body: binding }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}

export async function requireTeamServerBinding(app: FastifyInstance, projectId: string) {
  const [binding] = await app.teamRunDatabase
    .select()
    .from(teamServerBindings)
    .where(eq(teamServerBindings.projectId, projectId))
    .limit(1)
  if (!binding) {
    throw new ApiProblem(409, 'team_server_required', 'Bind a Team Server before continuing')
  }
  return {
    binding,
    pairing: decryptTeamServerPairing(app.teamRunConfig, binding.encryptedPairingOffer)
  }
}

function requireUsableTeamServer(status: TeamServerStatus): void {
  if (status.hostPlatform !== 'linux') {
    throw new ApiProblem(400, 'team_server_linux_required', 'Team Server must run on Linux')
  }
  if (!status.opencodeAvailable) {
    throw new ApiProblem(409, 'team_server_opencode_missing', 'Install OpenCode on the Team Server')
  }
  if (!status.credentialEncryptionAvailable) {
    throw new ApiProblem(
      409,
      'team_server_model_encryption_unavailable',
      'Configure encrypted model credential storage on the Team Server'
    )
  }
}

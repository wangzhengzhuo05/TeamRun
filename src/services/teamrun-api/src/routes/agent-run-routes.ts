import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  agentRunStatusSchema,
  createAgentRunRequestSchema,
  createVerificationResultRequestSchema,
  type AgentRunStatus,
  updateAgentRunStatusRequestSchema
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import {
  agentRuns,
  contextSnapshots,
  tasks,
  teamAgents,
  verificationResults
} from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import { requireIdempotencyKey, runIdempotentMutation } from '../http/idempotent-mutation.js'

const runTransitions: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  queued: ['starting', 'canceled', 'failed'],
  starting: ['working', 'needs_input', 'review', 'canceled', 'failed'],
  working: ['needs_input', 'review', 'canceled', 'failed'],
  needs_input: ['working', 'review', 'canceled', 'failed'],
  review: ['working', 'completed', 'canceled', 'failed'],
  completed: [],
  failed: [],
  canceled: []
}

const terminalStatuses = new Set<AgentRunStatus>(['completed', 'failed', 'canceled'])

async function requireRun(app: FastifyInstance, runId: string, userId: string) {
  const [run] = await app.teamRunDatabase
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1)
  if (!run) {
    throw new ApiProblem(404, 'agent_run_not_found', 'Agent run was not found')
  }
  await requireOrganizationRole(app.teamRunDatabase, run.organizationId, userId)
  return run
}

export async function registerAgentRunRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/tasks/:taskId/agent-runs', async (request) => {
    const { taskId } = request.params as { taskId: string }
    const [task] = await app.teamRunDatabase
      .select({ organizationId: tasks.organizationId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
    if (!task) {
      throw new ApiProblem(404, 'task_not_found', 'Task was not found')
    }
    await requireOrganizationRole(app.teamRunDatabase, task.organizationId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.taskId, taskId))
      .orderBy(agentRuns.createdAt)
  })

  app.post('/v1/tasks/:taskId/agent-runs', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = createAgentRunRequestSchema.parse(request.body)
    const [task] = await app.teamRunDatabase.select().from(tasks).where(eq(tasks.id, taskId))
    if (!task) {
      throw new ApiProblem(404, 'task_not_found', 'Task was not found')
    }
    await requireOrganizationRole(app.teamRunDatabase, task.organizationId, request.teamRunUser.id)
    const [snapshot] = await app.teamRunDatabase
      .select()
      .from(contextSnapshots)
      .where(
        and(eq(contextSnapshots.id, body.contextSnapshotId), eq(contextSnapshots.taskId, taskId))
      )
    if (!snapshot) {
      throw new ApiProblem(400, 'snapshot_task_mismatch', 'Context snapshot is not for this task')
    }
    const [teamAgent] = body.teamAgentId
      ? await app.teamRunDatabase
          .select()
          .from(teamAgents)
          .where(and(eq(teamAgents.id, body.teamAgentId), eq(teamAgents.projectId, task.projectId)))
          .limit(1)
      : []
    if (body.teamAgentId && !teamAgent) {
      throw new ApiProblem(400, 'team_agent_project_mismatch', 'Team Agent is not in this project')
    }
    if (teamAgent && teamAgent.agentKind !== body.agentKind) {
      throw new ApiProblem(
        400,
        'team_agent_kind_mismatch',
        'Team Agent kind does not match the run'
      )
    }
    const teamAgentSnapshot = teamAgent
      ? {
          id: teamAgent.id,
          name: teamAgent.name,
          agentKind: teamAgent.agentKind,
          launchCommand: teamAgent.launchCommand,
          instructionsMarkdown: teamAgent.instructionsMarkdown,
          version: teamAgent.version
        }
      : null
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/tasks/${taskId}/agent-runs`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [run] = await transaction
          .insert(agentRuns)
          .values({
            organizationId: task.organizationId,
            taskId,
            contextSnapshotId: body.contextSnapshotId,
            ownerUserId: request.teamRunUser.id,
            agentKind: body.agentKind,
            teamAgentSnapshot,
            baseRevision: body.baseRevision,
            clientRunId: body.clientRunId,
            stale: snapshot.taskVersion !== task.version
          })
          .returning()
        if (!run) {
          throw new ApiProblem(500, 'agent_run_create_failed', 'Agent run was not created')
        }
        await appendTeamEvent(transaction, {
          organizationId: task.organizationId,
          type: 'agent_run.created',
          entityId: run.id,
          actorUserId: request.teamRunUser.id,
          data: { taskId, agentKind: run.agentKind, status: run.status }
        })
        return { status: 201, body: run }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.patch('/v1/agent-runs/:runId/status', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const body = updateAgentRunStatusRequestSchema.parse(request.body)
    const run = await requireRun(app, runId, request.teamRunUser.id)
    if (run.ownerUserId !== request.teamRunUser.id) {
      throw new ApiProblem(403, 'run_status_forbidden', 'Only the run owner can report status')
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `PATCH /v1/agent-runs/${runId}/status`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [current] = await transaction
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.id, runId))
          .for('update')
        if (!current) {
          throw new ApiProblem(404, 'agent_run_not_found', 'Agent run was not found')
        }
        if (body.sequence <= current.lastSequence) {
          return { status: 200, body: current }
        }
        const status = agentRunStatusSchema.parse(body.status)
        if (status !== current.status && !runTransitions[current.status].includes(status)) {
          throw new ApiProblem(
            409,
            'invalid_run_transition',
            'Agent run status transition is invalid'
          )
        }
        const heartbeatAt = new Date(body.heartbeatAt)
        const [updated] = await transaction
          .update(agentRuns)
          .set({
            status,
            lastSequence: body.sequence,
            lastHeartbeatAt: heartbeatAt,
            startedAt:
              current.startedAt ??
              (status === 'starting' || status === 'working' ? heartbeatAt : null),
            completedAt: terminalStatuses.has(status) ? heartbeatAt : null,
            updatedAt: new Date()
          })
          .where(eq(agentRuns.id, runId))
          .returning()
        if (!updated) {
          throw new ApiProblem(500, 'run_status_update_failed', 'Agent run status was not updated')
        }
        await appendTeamEvent(transaction, {
          organizationId: current.organizationId,
          type: 'agent_run.status_updated',
          entityId: runId,
          actorUserId: request.teamRunUser.id,
          data: { status, sequence: body.sequence, stale: updated.stale }
        })
        return { status: 200, body: updated }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/agent-runs/:runId/verifications', async (request) => {
    const { runId } = request.params as { runId: string }
    await requireRun(app, runId, request.teamRunUser.id)
    return app.teamRunDatabase
      .select()
      .from(verificationResults)
      .where(eq(verificationResults.agentRunId, runId))
      .orderBy(verificationResults.createdAt)
  })

  app.post('/v1/agent-runs/:runId/verifications', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const body = createVerificationResultRequestSchema.parse(request.body)
    const run = await requireRun(app, runId, request.teamRunUser.id)
    if (run.ownerUserId !== request.teamRunUser.id) {
      throw new ApiProblem(
        403,
        'verification_create_forbidden',
        'Only the run owner can report verification'
      )
    }
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route: `POST /v1/agent-runs/${runId}/verifications`,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const [verification] = await transaction
          .insert(verificationResults)
          .values({ agentRunId: runId, ...body })
          .returning()
        if (!verification) {
          throw new ApiProblem(500, 'verification_create_failed', 'Verification was not saved')
        }
        return { status: 201, body: verification }
      }
    })
    return reply.code(result.status).send(result.body)
  })
}

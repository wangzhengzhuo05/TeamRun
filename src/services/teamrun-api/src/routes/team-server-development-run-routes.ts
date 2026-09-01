import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  startTeamServerDevelopmentRunRequestSchema,
  teamServerDevelopmentRunStateSchema,
  TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY,
  type AgentRunStatus,
  type TeamServerDevelopmentRunState
} from '@teamrun/contracts'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { agentRuns, contextSnapshots, repositories, tasks } from '../database/schema.js'
import { appendTeamEvent } from '../events/team-event-writer.js'
import { ApiProblem } from '../http/api-problem.js'
import {
  readIdempotentMutation,
  requireIdempotencyKey,
  runIdempotentMutation
} from '../http/idempotent-mutation.js'
import { sendTeamServerRuntimeRequest } from '../team-server/team-server-runtime-client.js'
import { requireTask } from './task-access.js'
import { requireTeamServerAgent } from './team-agent-access.js'
import { requireTeamServerBinding } from './team-server-routes.js'
import { deterministicTeamServerRunId } from './team-server-run-identity.js'

export function registerTeamServerDevelopmentRunRoutes(app: FastifyInstance): void {
  app.post('/v1/tasks/:taskId/team-server-runs', async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = startTeamServerDevelopmentRunRequestSchema.parse(request.body)
    const { task } = await requireTask(app, taskId, request.teamRunUser.id)
    await requireOrganizationRole(
      app.teamRunDatabase,
      task.organizationId,
      request.teamRunUser.id,
      ['owner', 'admin']
    )
    const key = requireIdempotencyKey(request.headers['idempotency-key'] as string | undefined)
    const route = `POST /v1/tasks/${taskId}/team-server-runs`
    const replay = await readIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route,
      key,
      requestBody: body
    })
    if (replay) {
      return reply.code(replay.status).send(replay.body)
    }
    const snapshot = await requireSnapshot(app, taskId, body.contextSnapshotId)
    const agent = await requireTeamServerAgent(app, task.projectId, body.teamAgentId)
    if (!agent.yoloMode) {
      throw new ApiProblem(
        409,
        'team_server_development_run_requires_yolo',
        'Enable YOLO mode for this Team Agent before starting a development run'
      )
    }
    const repository = await requireRunRepository(app, task.projectId, task.repositoryId)
    const { pairing } = await requireTeamServerBinding(app, task.projectId)
    await requireDevelopmentCapability(pairing)
    const runId = deterministicTeamServerRunId({
      userId: request.teamRunUser.id,
      taskId,
      idempotencyKey: key
    })
    const state = parseDevelopmentState(
      await sendTeamServerRuntimeRequest(
        pairing,
        'teamrun.teamAgent.startDevelopmentRun',
        {
          runId,
          connectionId: agent.modelConnectionId,
          agent: {
            name: agent.name,
            instructionsMarkdown: agent.instructionsMarkdown,
            yoloMode: true
          },
          repository: {
            remoteUrl: repository.remoteUrl,
            defaultBranch: repository.defaultBranch
          },
          task: { title: task.title, frozenContextMarkdown: snapshot.renderedMarkdown }
        },
        135_000
      )
    )
    const result = await runIdempotentMutation(app.teamRunDatabase, {
      userId: request.teamRunUser.id,
      route,
      key,
      requestBody: body,
      execute: async (transaction) => {
        const timestamp = new Date(state.updatedAt)
        const [run] = await transaction
          .insert(agentRuns)
          .values({
            id: runId,
            organizationId: task.organizationId,
            taskId,
            contextSnapshotId: snapshot.id,
            ownerUserId: request.teamRunUser.id,
            agentKind: agent.agentKind,
            teamAgentSnapshot: teamAgentSnapshot(agent),
            executionTarget: 'team_server',
            status: state.status,
            stale: snapshot.taskVersion !== task.version,
            baseRevision: { kind: 'git', objectId: state.baseObjectId },
            clientRunId: `team-server:${runId}`,
            lastSequence: state.sequence,
            lastHeartbeatAt: timestamp,
            startedAt: timestamp,
            completedAt: terminalStatus(state.status) ? timestamp : null
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
          data: {
            taskId,
            agentKind: run.agentKind,
            status: run.status,
            executionTarget: 'team_server'
          }
        })
        return { status: 201, body: run }
      }
    })
    return reply.code(result.status).send(result.body)
  })

  app.get('/v1/agent-runs/:runId/team-server-state', async (request) => {
    const { runId } = request.params as { runId: string }
    const [run] = await app.teamRunDatabase
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1)
    if (!run || run.executionTarget !== 'team_server') {
      throw new ApiProblem(404, 'team_server_run_not_found', 'Team Server run was not found')
    }
    await requireOrganizationRole(app.teamRunDatabase, run.organizationId, request.teamRunUser.id)
    const [task] = await app.teamRunDatabase
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, run.taskId))
    if (!task) {
      throw new ApiProblem(404, 'task_not_found', 'Task was not found')
    }
    const { pairing } = await requireTeamServerBinding(app, task.projectId)
    const state = parseDevelopmentState(
      await sendTeamServerRuntimeRequest(
        pairing,
        'teamrun.teamAgent.getDevelopmentRun',
        { runId },
        15_000
      )
    )
    await reconcileRunState(app, run, state)
    return state
  })
}

async function requireSnapshot(app: FastifyInstance, taskId: string, snapshotId: string) {
  const [snapshot] = await app.teamRunDatabase
    .select()
    .from(contextSnapshots)
    .where(and(eq(contextSnapshots.id, snapshotId), eq(contextSnapshots.taskId, taskId)))
    .limit(1)
  if (!snapshot) {
    throw new ApiProblem(400, 'snapshot_task_mismatch', 'Context snapshot is not for this task')
  }
  return snapshot
}

async function requireRunRepository(
  app: FastifyInstance,
  projectId: string,
  repositoryId: string | null
) {
  const [repository] = await app.teamRunDatabase
    .select()
    .from(repositories)
    .where(
      repositoryId
        ? and(eq(repositories.id, repositoryId), eq(repositories.projectId, projectId))
        : eq(repositories.projectId, projectId)
    )
    .orderBy(repositories.createdAt)
    .limit(1)
  if (!repository) {
    throw new ApiProblem(409, 'team_project_repository_required', 'Bind a repository first')
  }
  return repository
}

function parseDevelopmentState(value: unknown): TeamServerDevelopmentRunState {
  const result = teamServerDevelopmentRunStateSchema.safeParse(value)
  if (!result.success) {
    throw new ApiProblem(
      502,
      'team_server_development_state_invalid',
      'Team Server returned an invalid development run state'
    )
  }
  return result.data
}

async function requireDevelopmentCapability(
  pairing: Parameters<typeof sendTeamServerRuntimeRequest>[0]
) {
  const status = await sendTeamServerRuntimeRequest<{ capabilities?: string[] }>(
    pairing,
    'status.get',
    undefined,
    15_000
  )
  if (!status.capabilities?.includes(TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY)) {
    throw new ApiProblem(
      409,
      'team_server_development_run_update_required',
      'Update the Team Server before starting development runs'
    )
  }
}

async function reconcileRunState(
  app: FastifyInstance,
  run: typeof agentRuns.$inferSelect,
  state: TeamServerDevelopmentRunState
): Promise<void> {
  const timestamp = new Date(state.updatedAt)
  await app.teamRunDatabase.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, run.id))
      .for('update')
    if (!current || state.sequence <= current.lastSequence) {
      return
    }
    await transaction
      .update(agentRuns)
      .set({
        status: state.status,
        lastSequence: state.sequence,
        lastHeartbeatAt: timestamp,
        completedAt: terminalStatus(state.status) ? timestamp : null,
        updatedAt: timestamp
      })
      .where(eq(agentRuns.id, run.id))
    await appendTeamEvent(transaction, {
      organizationId: current.organizationId,
      type: 'agent_run.status_updated',
      entityId: run.id,
      actorUserId: current.ownerUserId,
      data: { status: state.status, sequence: state.sequence, executionTarget: 'team_server' }
    })
  })
}

function teamAgentSnapshot(agent: Awaited<ReturnType<typeof requireTeamServerAgent>>) {
  return {
    id: agent.id,
    name: agent.name,
    agentKind: agent.agentKind,
    launchCommand: agent.launchCommand,
    modelConnectionId: agent.modelConnectionId,
    yoloMode: agent.yoloMode,
    instructionsMarkdown: agent.instructionsMarkdown,
    version: agent.version
  }
}

function terminalStatus(status: AgentRunStatus): boolean {
  return status === 'failed' || status === 'canceled'
}

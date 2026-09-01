import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { modelConnections, teamAgents } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export async function requireTeamServerAgent(
  app: FastifyInstance,
  projectId: string,
  agentId: string
) {
  const [agent] = await app.teamRunDatabase
    .select()
    .from(teamAgents)
    .where(and(eq(teamAgents.id, agentId), eq(teamAgents.projectId, projectId)))
    .limit(1)
  if (!agent) {
    throw new ApiProblem(404, 'team_agent_not_found', 'Team Agent was not found')
  }
  if (agent.agentKind !== 'opencode' || !agent.modelConnectionId) {
    throw new ApiProblem(
      409,
      'team_agent_server_migration_required',
      'Recreate this Team Agent with a Team Server Model Connection'
    )
  }
  const [connection] = await app.teamRunDatabase
    .select({ id: modelConnections.id, keyConfigured: modelConnections.keyConfigured })
    .from(modelConnections)
    .where(
      and(
        eq(modelConnections.id, agent.modelConnectionId),
        eq(modelConnections.projectId, projectId)
      )
    )
    .limit(1)
  if (!connection?.keyConfigured) {
    throw new ApiProblem(
      409,
      'team_agent_model_connection_required',
      'Team Agent Model Connection is not configured'
    )
  }
  return agent as typeof agent & { modelConnectionId: string }
}

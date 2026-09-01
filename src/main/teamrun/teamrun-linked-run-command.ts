import { z } from 'zod'
import { createAgentRunRequestSchema } from '../../packages/teamrun-contracts/src/index'
import type { AgentRun } from '../../packages/teamrun-contracts/src/index'
import type { TeamRunApiClient } from './teamrun-api-client'

const idSchema = z.uuid()

export async function createLinkedTeamRun(
  client: TeamRunApiClient,
  args: unknown
): Promise<AgentRun> {
  const parsed = z
    .object({
      taskId: idSchema,
      run: createAgentRunRequestSchema,
      workspaceId: z.string().min(1).max(4096),
      workspacePath: z.string().min(1).max(32_768)
    })
    .parse(args)
  const run = await client.request<AgentRun>(`/v1/tasks/${parsed.taskId}/agent-runs`, {
    method: 'POST',
    body: parsed.run,
    queueIfOffline: false
  })
  client.putWorkspaceLink({
    clientRunId: parsed.run.clientRunId,
    agentRunId: run.id,
    workspaceId: parsed.workspaceId,
    workspacePath: parsed.workspacePath,
    taskId: parsed.taskId,
    baseRevision: parsed.run.baseRevision
  })
  return run
}

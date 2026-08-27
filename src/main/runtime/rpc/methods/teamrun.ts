import { z } from 'zod'
import { TEAMRUN_CLOUD_OPERATIONS } from '../../../../shared/teamrun-cloud-operations'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'

const Worktree = z.string().min(1).max(32_768)
const FullGitObjectId = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/, 'Expected a full git object id')

export const TEAMRUN_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'teamrun.cloudInvoke',
    params: z.object({
      operation: z.enum(TEAMRUN_CLOUD_OPERATIONS),
      args: z.unknown().optional()
    }),
    handler: (params, { runtime }) =>
      runtime.invokeTeamRunCloudOperation(params.operation, params.args)
  }),
  defineStreamingMethod({
    name: 'teamrun.events.subscribe',
    params: z.object({
      organizationId: z.uuid(),
      cursor: z.number().int().nonnegative().optional()
    }),
    handler: async (params, { runtime, signal }, emit) => {
      if (!signal) throw new Error('streaming_transport_required')
      await runtime.streamTeamRunCloudEvents(params.organizationId, params.cursor, signal, emit)
    }
  }),
  defineMethod({
    name: 'teamrun.verificationCommands',
    params: z.object({ worktree: Worktree }),
    handler: (params, { runtime }) => runtime.listTeamRunVerificationCommands(params.worktree)
  }),
  defineMethod({
    name: 'teamrun.runVerification',
    params: z.object({ worktree: Worktree, commandId: z.string().min(1).max(64) }),
    handler: (params, { runtime }) =>
      runtime.runTeamRunVerification(params.worktree, params.commandId)
  }),
  defineMethod({
    name: 'teamrun.preparePublication',
    params: z.object({
      worktree: Worktree,
      baseObjectId: FullGitObjectId,
      includeDiff: z.boolean()
    }),
    handler: (params, { runtime }) =>
      runtime.prepareTeamRunPublication(params.worktree, params.baseObjectId, params.includeDiff)
  })
]

import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'

const Worktree = z.string().min(1).max(32_768)
const FullGitObjectId = z
  .string()
  .regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/, 'Expected a full git object id')

export const TEAMRUN_METHODS: RpcMethod[] = [
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

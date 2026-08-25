import { describe, expect, it, vi } from 'vitest'
import {
  RUNTIME_CAPABILITIES,
  TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { TEAMRUN_METHODS } from './teamrun'

function makeRuntime() {
  return {
    getRuntimeId: () => 'test-runtime',
    listTeamRunVerificationCommands: vi.fn().mockResolvedValue([]),
    runTeamRunVerification: vi.fn().mockResolvedValue({
      command: { id: 'unit', label: 'Unit', command: 'pnpm test' },
      exitCode: 0,
      durationMs: 10,
      output: 'ok'
    }),
    prepareTeamRunPublication: vi.fn().mockResolvedValue({
      headObjectId: 'b'.repeat(40),
      commitObjectIds: []
    })
  } as unknown as OrcaRuntimeService
}

describe('TeamRun runtime RPC', () => {
  it('advertises the capability used by mixed-version clients', () => {
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY)
  })

  it('runs a host-resolved verification command by id', async () => {
    const runtime = makeRuntime()
    const response = await new RpcDispatcher({ runtime, methods: TEAMRUN_METHODS }).dispatch({
      id: 'verification',
      authToken: 'token',
      method: 'teamrun.runVerification',
      params: { worktree: 'repo::workspace', commandId: 'unit' }
    })

    expect(response).toMatchObject({ ok: true, result: { exitCode: 0 } })
    expect(runtime.runTeamRunVerification).toHaveBeenCalledWith('repo::workspace', 'unit')
  })

  it('rejects revision input that is not a full Git object id', async () => {
    const runtime = makeRuntime()
    const response = await new RpcDispatcher({ runtime, methods: TEAMRUN_METHODS }).dispatch({
      id: 'publication',
      authToken: 'token',
      method: 'teamrun.preparePublication',
      params: { worktree: 'repo::workspace', baseObjectId: 'HEAD', includeDiff: true }
    })

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(runtime.prepareTeamRunPublication).not.toHaveBeenCalled()
  })
})

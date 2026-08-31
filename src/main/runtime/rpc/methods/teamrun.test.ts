import { describe, expect, it, vi } from 'vitest'
import {
  TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY as CONTRACT_DEVELOPMENT_RUN_CAPABILITY,
  TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY as CONTRACT_DOCUMENT_EDIT_CAPABILITY
} from '../../../../packages/teamrun-contracts/src/index'
import {
  RUNTIME_CAPABILITIES,
  TEAMRUN_CLOUD_RUNTIME_CAPABILITY,
  TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY,
  TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY,
  TEAMRUN_TEAM_SERVER_RUNTIME_CAPABILITY,
  TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest, RpcResponse } from '../core'
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
    }),
    getTeamServerStatus: vi.fn().mockResolvedValue({
      runtimeId: 'test-runtime',
      hostPlatform: 'linux',
      opencodeAvailable: true,
      credentialEncryptionAvailable: true
    }),
    configureTeamServerModelConnection: vi.fn().mockReturnValue({ configured: true }),
    runTeamServerAgentReply: vi.fn().mockResolvedValue({ bodyMarkdown: 'Ready.' }),
    proposeTeamServerDocumentEdit: vi
      .fn()
      .mockResolvedValue({ proposedContentMarkdown: '# Updated' }),
    startTeamServerDevelopmentRun: vi.fn().mockResolvedValue({
      runId: crypto.randomUUID(),
      status: 'working',
      baseObjectId: 'a'.repeat(40)
    }),
    getTeamServerDevelopmentRun: vi.fn().mockResolvedValue({ status: 'review' }),
    invokeTeamRunCloudOperation: vi.fn().mockResolvedValue({ state: 'signed-out' })
  } as unknown as OrcaRuntimeService
}

async function dispatchAsPairedRuntime(
  dispatcher: RpcDispatcher,
  request: RpcRequest,
  clientCapabilities: string[] = [
    TEAMRUN_TEAM_SERVER_RUNTIME_CAPABILITY,
    TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY,
    TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY
  ]
): Promise<RpcResponse> {
  let response: RpcResponse | undefined
  await dispatcher.dispatchStreaming(
    request,
    (frame) => {
      response = JSON.parse(frame) as RpcResponse
    },
    {
      clientKind: 'runtime',
      pairedDeviceId: 'team-server-control',
      clientCapabilities
    }
  )
  if (!response) {
    throw new Error('missing_test_response')
  }
  return response
}

describe('TeamRun runtime RPC', () => {
  it('advertises the capability used by mixed-version clients', () => {
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_WORKSPACE_OPERATIONS_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_CLOUD_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_TEAM_SERVER_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY)
    expect(TEAMRUN_TEAM_SERVER_DOCUMENT_EDIT_RUNTIME_CAPABILITY).toBe(
      CONTRACT_DOCUMENT_EDIT_CAPABILITY
    )
    expect(TEAMRUN_TEAM_SERVER_DEVELOPMENT_RUN_RUNTIME_CAPABILITY).toBe(
      CONTRACT_DEVELOPMENT_RUN_CAPABILITY
    )
  })

  it('capability-gates Team Server development runs', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TEAMRUN_METHODS })
    const runId = crypto.randomUUID()
    const request: RpcRequest = {
      id: 'development-run',
      authToken: 'token',
      method: 'teamrun.teamAgent.startDevelopmentRun',
      params: {
        runId,
        connectionId: crypto.randomUUID(),
        agent: { name: 'Developer', instructionsMarkdown: 'Implement it.', yoloMode: true },
        repository: {
          remoteUrl: 'https://example.test/team/project.git',
          defaultBranch: 'main'
        },
        task: { title: 'Add it', frozenContextMarkdown: '# Frozen context' }
      }
    }
    const accepted = await dispatchAsPairedRuntime(dispatcher, request)
    const legacy = await dispatchAsPairedRuntime(dispatcher, request, [
      TEAMRUN_TEAM_SERVER_RUNTIME_CAPABILITY
    ])

    expect(accepted).toMatchObject({ ok: true, result: { status: 'working' } })
    expect(legacy).toMatchObject({
      ok: false,
      error: { code: 'team_server_paired_runtime_required' }
    })
  })

  it('exposes bounded Team Server model configuration and chat methods', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TEAMRUN_METHODS })
    const connectionId = crypto.randomUUID()
    const configured = await dispatchAsPairedRuntime(dispatcher, {
      id: 'model-config',
      authToken: 'token',
      method: 'teamrun.modelConnection.configure',
      params: {
        connectionId,
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'secret',
        model: 'review-model'
      }
    })
    const response = await dispatchAsPairedRuntime(dispatcher, {
      id: 'chat-reply',
      authToken: 'token',
      method: 'teamrun.teamAgent.reply',
      params: {
        connectionId,
        agent: { name: 'Reviewer', instructionsMarkdown: 'Be concise.' },
        messages: [{ author: 'Team member', bodyMarkdown: 'Review this.' }]
      }
    })
    const proposal = await dispatchAsPairedRuntime(dispatcher, {
      id: 'document-proposal',
      authToken: 'token',
      method: 'teamrun.teamAgent.proposeDocumentEdit',
      params: {
        connectionId,
        agent: { name: 'Recorder', instructionsMarkdown: 'Preserve facts.' },
        path: 'docs/notes.md',
        instructionsMarkdown: 'Add the decision.',
        currentContentMarkdown: '# Notes'
      }
    })
    const legacyDocumentClient = await dispatchAsPairedRuntime(
      dispatcher,
      {
        id: 'legacy-document-proposal',
        authToken: 'token',
        method: 'teamrun.teamAgent.proposeDocumentEdit',
        params: {
          connectionId,
          agent: { name: 'Recorder', instructionsMarkdown: 'Preserve facts.' },
          path: 'docs/notes.md',
          instructionsMarkdown: 'Add the decision.',
          currentContentMarkdown: '# Notes'
        }
      },
      [TEAMRUN_TEAM_SERVER_RUNTIME_CAPABILITY]
    )
    const unpaired = await dispatcher.dispatch({
      id: 'unpaired-model-config',
      authToken: 'token',
      method: 'teamrun.modelConnection.configure',
      params: {
        connectionId,
        baseUrl: 'https://models.example.test/v1',
        apiKey: 'secret',
        model: 'review-model'
      }
    })

    expect(configured).toMatchObject({ ok: true, result: { configured: true } })
    expect(response).toMatchObject({ ok: true, result: { bodyMarkdown: 'Ready.' } })
    expect(proposal).toMatchObject({
      ok: true,
      result: { proposedContentMarkdown: '# Updated' }
    })
    expect(legacyDocumentClient).toMatchObject({
      ok: false,
      error: { code: 'team_server_paired_runtime_required' }
    })
    expect(unpaired).toMatchObject({
      ok: false,
      error: { code: 'team_server_paired_runtime_required' }
    })
  })

  it('dispatches only allowlisted TeamRun cloud operations', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: TEAMRUN_METHODS })
    const response = await dispatcher.dispatch({
      id: 'cloud-auth',
      authToken: 'token',
      method: 'teamrun.cloudInvoke',
      params: { operation: 'auth.status' }
    })
    const rejected = await dispatcher.dispatch({
      id: 'cloud-arbitrary',
      authToken: 'token',
      method: 'teamrun.cloudInvoke',
      params: { operation: 'ipc.invoke' }
    })

    expect(response).toMatchObject({ ok: true, result: { state: 'signed-out' } })
    expect(runtime.invokeTeamRunCloudOperation).toHaveBeenCalledWith('auth.status', undefined)
    expect(rejected).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
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

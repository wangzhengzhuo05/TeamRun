import { randomUUID } from 'node:crypto'
import type { TeamRunVerificationCommand } from '../../shared/orca-yaml-hook-types'
import type { Store } from '../persistence'
import { runAutomationPrecheck } from '../automations/precheck-runner'
import type { TeamRunApiClient } from './teamrun-api-client'
import { loadTeamRunWorkspaceConfig } from './teamrun-project-config'
import type { VerificationResult } from '../../packages/teamrun-contracts/src/index'
import type { TeamRunRuntimeVerificationResult } from '../../shared/teamrun-runtime'
import { callTeamRunRuntime } from './teamrun-runtime-client'
import { resolveTeamRunWorkspaceTarget } from './teamrun-workspace-target'

const MAX_OUTPUT_CHARS = 65_536

type RunContext = {
  command: TeamRunVerificationCommand
  workspacePath: string
  connectionId: string | null
}

export class TeamRunVerificationService {
  constructor(
    private readonly store: Store,
    private readonly client: TeamRunApiClient,
    private readonly userDataPath: string
  ) {}

  async listCommands(clientRunId: string): Promise<TeamRunVerificationCommand[]> {
    const context = await this.#resolve(clientRunId)
    if (context.runtimeEnvironmentId) {
      return callTeamRunRuntime({
        userDataPath: this.userDataPath,
        environmentId: context.runtimeEnvironmentId,
        method: 'teamrun.verificationCommands',
        params: { worktree: context.workspaceId }
      })
    }
    return context.commands
  }

  async run(args: {
    runId: string
    clientRunId: string
    commandId: string
  }): Promise<VerificationResult> {
    const resolved = await this.#resolve(args.clientRunId)
    if (resolved.agentRunId !== args.runId) {
      throw new Error('TeamRun agent run does not match workspace.')
    }
    const result = resolved.runtimeEnvironmentId
      ? await callTeamRunRuntime<TeamRunRuntimeVerificationResult>({
          userDataPath: this.userDataPath,
          environmentId: resolved.runtimeEnvironmentId,
          method: 'teamrun.runVerification',
          params: { worktree: resolved.workspaceId, commandId: args.commandId },
          timeoutMs: 16 * 60_000
        })
      : await this.#runLocal({
          command: this.#command(resolved.commands, args.commandId),
          workspacePath: resolved.workspacePath,
          connectionId: resolved.connectionId
        })
    const verification: VerificationResult = {
      id: randomUUID(),
      agentRunId: args.runId,
      commandId: result.command.id,
      commandLabel: result.command.label,
      command: result.command.command,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      output: result.output,
      createdAt: new Date().toISOString()
    }
    this.client.putVerification(verification)
    return verification
  }

  async #runLocal(context: RunContext): Promise<TeamRunRuntimeVerificationResult> {
    const result = await runAutomationPrecheck({
      precheck: { command: context.command.command, timeoutSeconds: 15 * 60 },
      target: context.connectionId
        ? { type: 'ssh', cwd: context.workspacePath, connectionId: context.connectionId }
        : { type: 'local', cwd: context.workspacePath }
    })
    return {
      command: context.command,
      exitCode: result.exitCode ?? -1,
      durationMs: result.durationMs,
      output: [result.stdout, result.stderr, result.error]
        .filter(Boolean)
        .join('\n')
        .slice(-MAX_OUTPUT_CHARS)
    }
  }

  #command(commands: TeamRunVerificationCommand[], commandId: string): TeamRunVerificationCommand {
    const command = commands.find((candidate) => candidate.id === commandId)
    if (!command) {
      throw new Error('Verification command is not declared in teamrun.yaml.')
    }
    return command
  }

  async #resolve(clientRunId: string) {
    const workspace = this.client.getWorkspaceLink(clientRunId)
    if (!workspace) {
      throw new Error('TeamRun workspace link is not available on this device.')
    }
    const target = resolveTeamRunWorkspaceTarget(this.store, workspace)
    const config = target.runtimeEnvironmentId
      ? null
      : await loadTeamRunWorkspaceConfig(target.path, target.connectionId)
    return {
      ...workspace,
      workspacePath: target.path,
      connectionId: target.connectionId,
      runtimeEnvironmentId: target.runtimeEnvironmentId,
      commands: config?.scripts.verify ?? []
    }
  }
}

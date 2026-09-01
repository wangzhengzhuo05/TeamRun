import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TeamRunVerificationCommand } from '../../shared/orca-yaml-hook-types'
import type { Repo } from '../../shared/repo-types'
import type {
  TeamRunRuntimePublicationResult,
  TeamRunRuntimeVerificationResult
} from '../../shared/teamrun-runtime'
import type { Worktree } from '../../shared/worktree/types'
import { parseOrcaYaml } from '../../shared/orca-yaml'
import { mergeTeamRunProjectConfig, parseTeamRunYaml } from '../../shared/teamrun-yaml'
import { runAutomationPrecheck } from '../automations/precheck-runner'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import { gitExecFileAsync } from '../git/runner'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import { joinWorktreeRelativePath } from './runtime-relative-paths'
import { collectTeamRunGitResult, TEAMRUN_DIFF_MAX_BYTES } from '../teamrun/teamrun-git-result'

const MAX_OUTPUT_CHARS = 65_536

type RuntimeFileTarget = { worktree: Worktree; connectionId?: string }
type RuntimeGitTarget = RuntimeFileTarget & {
  repo?: Repo
  localGitOptions?: GitRuntimeOptions
}

export type RuntimeTeamRunCommandHost = {
  resolveRuntimeFileTarget(selector: string): Promise<RuntimeFileTarget>
  resolveRuntimeGitTarget(selector: string): Promise<RuntimeGitTarget>
}

async function readConfigFile(target: RuntimeFileTarget, fileName: string): Promise<string | null> {
  if (target.connectionId) {
    const provider = getSshFilesystemProvider(target.connectionId)
    if (!provider) {
      throw new Error('TeamRun SSH workspace is not connected.')
    }
    try {
      const result = await provider.readFile(
        joinWorktreeRelativePath(target.worktree.path, fileName)
      )
      return result.isBinary ? null : result.content
    } catch {
      return null
    }
  }
  try {
    return await readFile(join(target.worktree.path, fileName), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function loadCommands(target: RuntimeFileTarget): Promise<TeamRunVerificationCommand[]> {
  const [teamRunSource, orcaSource] = await Promise.all([
    readConfigFile(target, 'teamrun.yaml'),
    readConfigFile(target, 'orca.yaml')
  ])
  const teamRun = teamRunSource === null ? null : parseTeamRunYaml(teamRunSource)
  const orca = orcaSource === null ? null : parseOrcaYaml(orcaSource)
  return mergeTeamRunProjectConfig(teamRun, orca)?.scripts.verify ?? []
}

export class RuntimeTeamRunCommands {
  constructor(private readonly host: RuntimeTeamRunCommandHost) {}

  async listVerificationCommands(worktree: string): Promise<TeamRunVerificationCommand[]> {
    return loadCommands(await this.host.resolveRuntimeFileTarget(worktree))
  }

  async runVerification(
    worktree: string,
    commandId: string
  ): Promise<TeamRunRuntimeVerificationResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktree)
    const command = (await loadCommands(target)).find((candidate) => candidate.id === commandId)
    if (!command) {
      throw new Error('Verification command is not declared in teamrun.yaml.')
    }
    const result = await runAutomationPrecheck({
      precheck: { command: command.command, timeoutSeconds: 15 * 60 },
      target: target.connectionId
        ? { type: 'ssh', cwd: target.worktree.path, connectionId: target.connectionId }
        : { type: 'local', cwd: target.worktree.path }
    })
    return {
      command,
      exitCode: result.exitCode ?? -1,
      durationMs: result.durationMs,
      output: [result.stdout, result.stderr, result.error]
        .filter(Boolean)
        .join('\n')
        .slice(-MAX_OUTPUT_CHARS)
    }
  }

  async preparePublication(
    worktree: string,
    baseObjectId: string,
    includeDiff: boolean
  ): Promise<TeamRunRuntimePublicationResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktree)
    const git = async (args: string[]) => {
      if (target.connectionId) {
        const provider = getSshGitProvider(target.connectionId)
        if (!provider) {
          throw new Error('TeamRun SSH workspace is not connected.')
        }
        return provider.exec(args, target.worktree.path, { timeoutMs: 60_000 })
      }
      return gitExecFileAsync(args, {
        cwd: target.worktree.path,
        timeout: 60_000,
        maxBuffer: TEAMRUN_DIFF_MAX_BYTES + 1024,
        ...target.localGitOptions
      })
    }
    return collectTeamRunGitResult({
      git,
      workspacePath: target.worktree.path,
      connectionId: target.connectionId ?? null,
      baseObjectId,
      includeDiff
    })
  }
}

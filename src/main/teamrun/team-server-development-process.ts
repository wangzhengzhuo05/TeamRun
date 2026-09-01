import { spawn } from 'node:child_process'
import type { TeamServerModelConnectionSecret } from './team-server-model-connection-store'
import { teamServerDevelopmentPrompt } from './team-server-development-prompt'
import {
  prepareTeamServerOpenCodeEnvironment,
  removeTeamServerOpenCodeKey
} from './team-server-opencode-environment'

const RUN_TIMEOUT_MS = 30 * 60 * 1000
const TERMINATION_GRACE_MS = 10_000
const MAX_LINE_BUFFER_CHARS = 500_000

export async function startTeamServerDevelopmentProcess(args: {
  runId: string
  workspacePath: string
  agentHomePath: string
  connection: TeamServerModelConnectionSecret
  agentName: string
  agentInstructionsMarkdown: string
  taskTitle: string
  frozenContextMarkdown: string
  branchName: string
  onActivity: (value: string) => void
  onFinished: (exitCode: number | null, failureCode: string | null) => void
}): Promise<void> {
  const prompt = teamServerDevelopmentPrompt({
    agentName: args.agentName,
    agentInstructionsMarkdown: args.agentInstructionsMarkdown,
    taskTitle: args.taskTitle,
    frozenContextMarkdown: args.frozenContextMarkdown,
    branchName: args.branchName
  })
  const environment = await prepareTeamServerOpenCodeEnvironment(
    args.agentHomePath,
    args.connection,
    'development-yolo'
  )
  const child = spawn(
    'opencode',
    [
      'run',
      '--auto',
      '--format',
      'json',
      '--model',
      `teamrun/${args.connection.model}`,
      '--title',
      `TeamRun development ${args.runId.slice(0, 8)}`,
      prompt
    ],
    {
      cwd: args.workspacePath,
      env: environment,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  const flushers = [
    captureLines(child.stdout, '', args.onActivity),
    captureLines(child.stderr, '[stderr] ', args.onActivity)
  ]
  let spawned = false
  let failureCode: string | null = null
  const timeout = setTimeout(() => {
    failureCode = 'team_server_development_run_timeout'
    terminateProcess(child.pid, 'SIGTERM', () => child.kill('SIGTERM'))
  }, RUN_TIMEOUT_MS)
  const forceTermination = setTimeout(() => {
    if (failureCode === 'team_server_development_run_timeout') {
      terminateProcess(child.pid, 'SIGKILL', () => child.kill('SIGKILL'))
    }
  }, RUN_TIMEOUT_MS + TERMINATION_GRACE_MS)
  child.once('error', (error) => {
    failureCode = processFailureCode(error)
    if (spawned) {
      return
    }
    clearTimeout(timeout)
    clearTimeout(forceTermination)
  })
  child.once('close', (code) => {
    clearTimeout(timeout)
    clearTimeout(forceTermination)
    for (const flush of flushers) {
      flush()
    }
    void removeTeamServerOpenCodeKey(args.agentHomePath)
      .catch(() => undefined)
      .then(() => {
        if (spawned) {
          args.onFinished(code, failureCode)
        }
      })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        spawned = true
        resolve()
      })
      child.once('error', reject)
    })
  } catch (error) {
    await removeTeamServerOpenCodeKey(args.agentHomePath).catch(() => undefined)
    throw error
  }
}

function terminateProcess(
  pid: number | undefined,
  signal: NodeJS.Signals,
  fallback: () => boolean
): void {
  if (process.platform !== 'win32' && pid) {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // The child may exit between the timeout and signal delivery.
    }
  }
  fallback()
}

function captureLines(
  stream: NodeJS.ReadableStream,
  prefix: string,
  onActivity: (value: string) => void
): () => void {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += String(chunk)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      onActivity(`${prefix}${line}\n`)
    }
    if (buffer.length > MAX_LINE_BUFFER_CHARS) {
      onActivity(`${prefix}${buffer}\n`)
      buffer = ''
    }
  })
  return () => {
    if (buffer) {
      onActivity(`${prefix}${buffer}`)
    }
    buffer = ''
  }
}

function processFailureCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
    ? 'team_server_opencode_missing'
    : 'team_server_development_run_failed'
}

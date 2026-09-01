import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 120_000
const GIT_OUTPUT_BYTES = 1_200_000
const repositoryLocks = new Map<string, Promise<void>>()

export type TeamServerDevelopmentWorkspace = {
  workspacePath: string
  branchName: string
  baseObjectId: string
}

export type TeamServerDevelopmentResult = {
  headObjectId: string
  diffPatch: string
  diffTruncated: boolean
}

export async function prepareTeamServerDevelopmentWorkspace(args: {
  root: string
  runId: string
  remoteUrl: string
  defaultBranch: string
}): Promise<TeamServerDevelopmentWorkspace> {
  const repositoryKey = createHash('sha256').update(args.remoteUrl).digest('hex')
  return withRepositoryLock(repositoryKey, async () => {
    const repositoryPath = join(args.root, 'repositories', repositoryKey)
    const workspacePath = join(args.root, 'runs', args.runId, 'workspace')
    const branchName = `teamrun/${args.runId}`
    await validateBranchName(args.defaultBranch)
    await validateBranchName(branchName)
    await ensureRepository(repositoryPath, args.remoteUrl)
    await fetchDefaultBranch(repositoryPath, args.defaultBranch)
    await ensureFreshWorkspace(repositoryPath, workspacePath, branchName, args.defaultBranch)
    const baseObjectId = await gitOutput(repositoryPath, [
      'rev-parse',
      `refs/remotes/origin/${args.defaultBranch}`
    ])
    return { workspacePath, branchName, baseObjectId }
  })
}

export async function readTeamServerDevelopmentResult(
  workspacePath: string,
  baseObjectId: string
): Promise<TeamServerDevelopmentResult> {
  const headObjectId = await gitOutput(workspacePath, ['rev-parse', 'HEAD'])
  try {
    await runGit(['-C', workspacePath, 'add', '--intent-to-add', '--', '.'])
    const { stdout: diffPatch } = await runGit([
      '-C',
      workspacePath,
      'diff',
      '--binary',
      baseObjectId
    ])
    return { headObjectId, diffPatch, diffTruncated: false }
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout
    if (
      (error as NodeJS.ErrnoException).code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
      typeof stdout !== 'string'
    ) {
      throw error
    }
    return {
      headObjectId,
      diffPatch: stdout.slice(0, GIT_OUTPUT_BYTES),
      diffTruncated: true
    }
  }
}

async function ensureRepository(repositoryPath: string, remoteUrl: string): Promise<void> {
  if (await exists(join(repositoryPath, '.git'))) {
    return
  }
  await rm(repositoryPath, { recursive: true, force: true })
  await mkdir(dirname(repositoryPath), { recursive: true })
  await runGit(['clone', '--no-checkout', '--origin', 'origin', remoteUrl, repositoryPath])
}

async function fetchDefaultBranch(repositoryPath: string, defaultBranch: string): Promise<void> {
  const refspec = `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`
  await runGit(['-C', repositoryPath, 'fetch', '--no-tags', 'origin', refspec])
  await runGit(['-C', repositoryPath, 'worktree', 'prune'])
}

async function ensureFreshWorkspace(
  repositoryPath: string,
  workspacePath: string,
  branchName: string,
  defaultBranch: string
): Promise<void> {
  if (await exists(join(workspacePath, '.git'))) {
    return
  }
  await rm(workspacePath, { recursive: true, force: true })
  await mkdir(dirname(workspacePath), { recursive: true })
  await runGit([
    '-C',
    repositoryPath,
    'worktree',
    'add',
    '-b',
    branchName,
    workspacePath,
    `refs/remotes/origin/${defaultBranch}`
  ])
}

async function validateBranchName(branchName: string): Promise<void> {
  await runGit(['check-ref-format', '--branch', branchName])
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(['-C', cwd, ...args])
  return result.stdout.trim()
}

function runGit(args: string[]) {
  return execFileAsync('git', ['-c', 'maintenance.auto=false', ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_OUTPUT_BYTES,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function withRepositoryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = repositoryLocks.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(
    () => undefined,
    () => undefined
  )
  repositoryLocks.set(key, tail)
  try {
    return await current
  } finally {
    if (repositoryLocks.get(key) === tail) {
      repositoryLocks.delete(key)
    }
  }
}

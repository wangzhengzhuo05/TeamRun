import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type StoredTeamServerDevelopmentRun = {
  runId: string
  requestHash: string
  status: 'starting' | 'working' | 'review' | 'failed' | 'canceled'
  sequence: number
  workspacePath: string | null
  branchName: string
  baseObjectId: string | null
  headObjectId: string | null
  logTruncated: boolean
  diffTruncated: boolean
  failureCode: string | null
  updatedAt: string
}

export class TeamServerDevelopmentRunStore {
  readonly #root: string

  constructor(userDataPath: string) {
    this.#root = join(userDataPath, 'team-server-development-runs')
  }

  workspaceRoot(): string {
    return this.#root
  }

  agentHomePath(runId: string): string {
    return this.#path(runId, 'agent-home')
  }

  async load(runId: string): Promise<StoredTeamServerDevelopmentRun | null> {
    try {
      return JSON.parse(
        await readFile(this.#path(runId, 'state.json'), 'utf8')
      ) as StoredTeamServerDevelopmentRun
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async save(state: StoredTeamServerDevelopmentRun): Promise<void> {
    const directory = this.#directory(state.runId)
    const temporary = this.#path(state.runId, `state-${process.pid}-${randomUUID()}.tmp`)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.#path(state.runId, 'state.json'))
  }

  async appendActivity(runId: string, text: string): Promise<void> {
    await mkdir(this.#directory(runId), { recursive: true, mode: 0o700 })
    await appendFile(this.#path(runId, 'activity.log'), text, { encoding: 'utf8', mode: 0o600 })
  }

  async readActivity(runId: string): Promise<string> {
    return this.#readOptional(runId, 'activity.log')
  }

  async saveDiff(runId: string, diffPatch: string): Promise<void> {
    await mkdir(this.#directory(runId), { recursive: true, mode: 0o700 })
    await writeFile(this.#path(runId, 'changes.patch'), diffPatch, {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  async readDiff(runId: string): Promise<string> {
    return this.#readOptional(runId, 'changes.patch')
  }

  async #readOptional(runId: string, name: string): Promise<string> {
    try {
      return await readFile(this.#path(runId, name), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  #directory(runId: string): string {
    requireRunId(runId)
    return join(this.#root, 'runs', runId)
  }

  #path(runId: string, name: string): string {
    return join(this.#directory(runId), name)
  }
}

function requireRunId(runId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error('team_server_development_run_id_invalid')
  }
}

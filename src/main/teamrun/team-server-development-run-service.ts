import { createHash } from 'node:crypto'
import type { TeamServerDevelopmentRunState } from '../../packages/teamrun-contracts/src/index'
import { startTeamServerDevelopmentProcess } from './team-server-development-process'
import { redactTeamServerDevelopmentOutput } from './team-server-development-redaction'
import {
  TeamServerDevelopmentRunStore,
  type StoredTeamServerDevelopmentRun
} from './team-server-development-run-store'
import {
  prepareTeamServerDevelopmentWorkspace,
  readTeamServerDevelopmentResult
} from './team-server-development-worktree'
import {
  requireLinuxTeamServer,
  requireTeamServerDevelopmentInput,
  teamServerDevelopmentFailureCode
} from './team-server-development-validation'
import { TeamServerModelConnectionStore } from './team-server-model-connection-store'

const MAX_ACTIVE_RUNS = 2
const MAX_ACTIVITY_CHARS = 500_000
const MAX_DIFF_CHARS = 1_000_000

export type StartTeamServerDevelopmentRunArgs = {
  runId: string
  connectionId: string
  agent: {
    name: string
    instructionsMarkdown: string
    yoloMode: boolean
  }
  repository: {
    remoteUrl: string
    defaultBranch: string
  }
  task: {
    title: string
    frozenContextMarkdown: string
  }
}

type RunRecord = {
  state: StoredTeamServerDevelopmentRun
  activityChars: number
  logWrite: Promise<void>
  sensitiveValues: string[]
  pendingFailureCode: string | null
  finished: boolean
}

export class TeamServerDevelopmentRunService {
  readonly #connections: TeamServerModelConnectionStore
  readonly #store: TeamServerDevelopmentRunStore
  readonly #records = new Map<string, RunRecord>()
  readonly #startPromises = new Map<string, Promise<TeamServerDevelopmentRunState>>()
  readonly #liveRunIds = new Set<string>()

  constructor(userDataPath: string) {
    this.#connections = new TeamServerModelConnectionStore(userDataPath)
    this.#store = new TeamServerDevelopmentRunStore(userDataPath)
  }

  async start(args: StartTeamServerDevelopmentRunArgs): Promise<TeamServerDevelopmentRunState> {
    requireLinuxTeamServer()
    requireTeamServerDevelopmentInput(args)
    const requestHash = createHash('sha256').update(JSON.stringify(args)).digest('hex')
    const existing = await this.#record(args.runId)
    if (existing) {
      if (existing.state.requestHash !== requestHash) {
        throw new Error('team_server_development_run_conflict')
      }
      return this.#startPromises.get(args.runId) ?? this.#publicState(existing)
    }
    if (this.#liveRunIds.size + this.#startPromises.size >= MAX_ACTIVE_RUNS) {
      throw new Error('team_server_development_run_capacity')
    }
    const record = newRecord(args.runId, requestHash)
    this.#records.set(args.runId, record)
    await this.#store.save(record.state)
    const started = this.#prepareAndStart(record, args).finally(() => {
      this.#startPromises.delete(args.runId)
    })
    this.#startPromises.set(args.runId, started)
    return started
  }

  async get(runId: string): Promise<TeamServerDevelopmentRunState> {
    const record = await this.#record(runId)
    if (!record) {
      throw new Error('team_server_development_run_not_found')
    }
    if (
      (record.state.status === 'starting' || record.state.status === 'working') &&
      !this.#liveRunIds.has(runId) &&
      !this.#startPromises.has(runId)
    ) {
      await this.#fail(record, 'team_server_development_run_interrupted')
    }
    return this.#publicState(record)
  }

  async #prepareAndStart(
    record: RunRecord,
    args: StartTeamServerDevelopmentRunArgs
  ): Promise<TeamServerDevelopmentRunState> {
    try {
      const connection = this.#connections.read(args.connectionId)
      if (!connection) {
        throw new Error('team_server_model_connection_missing')
      }
      const workspace = await prepareTeamServerDevelopmentWorkspace({
        root: this.#store.workspaceRoot(),
        runId: args.runId,
        remoteUrl: args.repository.remoteUrl,
        defaultBranch: args.repository.defaultBranch
      })
      record.state = {
        ...record.state,
        status: 'working',
        sequence: 2,
        workspacePath: workspace.workspacePath,
        branchName: workspace.branchName,
        baseObjectId: workspace.baseObjectId,
        updatedAt: new Date().toISOString()
      }
      await this.#store.save(record.state)
      await this.#spawnAgent(record, args, connection)
      return this.#publicState(record)
    } catch (error) {
      await this.#fail(record, teamServerDevelopmentFailureCode(error))
      if (record.state.baseObjectId) {
        return this.#publicState(record)
      }
      throw error
    }
  }

  async #spawnAgent(
    record: RunRecord,
    args: StartTeamServerDevelopmentRunArgs,
    connection: NonNullable<ReturnType<TeamServerModelConnectionStore['read']>>
  ): Promise<void> {
    const workspacePath = record.state.workspacePath
    if (!workspacePath) {
      throw new Error('team_server_development_workspace_missing')
    }
    this.#liveRunIds.add(record.state.runId)
    record.sensitiveValues = [connection.apiKey]
    await startTeamServerDevelopmentProcess({
      runId: args.runId,
      workspacePath,
      agentHomePath: this.#store.agentHomePath(args.runId),
      connection,
      agentName: args.agent.name,
      agentInstructionsMarkdown: args.agent.instructionsMarkdown,
      taskTitle: args.task.title,
      frozenContextMarkdown: args.task.frozenContextMarkdown,
      branchName: record.state.branchName,
      onActivity: (value) => this.#appendActivity(record, value),
      onFinished: (exitCode, failureCode) => {
        record.pendingFailureCode = failureCode
        void this.#finish(record, exitCode).catch(() => undefined)
      }
    })
  }

  #appendActivity(record: RunRecord, value: string): void {
    const redacted = redactTeamServerDevelopmentOutput(value, record.sensitiveValues)
    const remaining = MAX_ACTIVITY_CHARS - record.activityChars
    if (remaining <= 0) {
      record.state.logTruncated = true
      return
    }
    const accepted = redacted.slice(0, remaining)
    record.activityChars += accepted.length
    record.state.logTruncated ||= accepted.length < redacted.length
    record.logWrite = record.logWrite.then(() =>
      this.#store.appendActivity(record.state.runId, accepted)
    )
  }

  async #finish(record: RunRecord, exitCode: number | null): Promise<void> {
    if (record.finished) {
      return
    }
    record.finished = true
    this.#liveRunIds.delete(record.state.runId)
    await record.logWrite
    try {
      const result = await readTeamServerDevelopmentResult(
        record.state.workspacePath!,
        record.state.baseObjectId!
      )
      const redactedDiff = redactTeamServerDevelopmentOutput(
        result.diffPatch,
        record.sensitiveValues
      )
      const diffPatch = redactedDiff.slice(0, MAX_DIFF_CHARS)
      await this.#store.saveDiff(record.state.runId, diffPatch)
      record.state = {
        ...record.state,
        status: exitCode === 0 && !record.pendingFailureCode ? 'review' : 'failed',
        sequence: 3,
        headObjectId: result.headObjectId,
        diffTruncated: result.diffTruncated || diffPatch.length < redactedDiff.length,
        failureCode:
          record.pendingFailureCode ??
          (exitCode === 0 ? null : 'team_server_development_run_failed'),
        updatedAt: new Date().toISOString()
      }
      await this.#store.save(record.state)
    } catch (error) {
      await this.#fail(record, teamServerDevelopmentFailureCode(error))
    }
  }

  async #fail(record: RunRecord, code: string): Promise<void> {
    this.#liveRunIds.delete(record.state.runId)
    record.state = {
      ...record.state,
      status: 'failed',
      sequence: Math.max(record.state.sequence + 1, 2),
      failureCode: code,
      updatedAt: new Date().toISOString()
    }
    await this.#store.save(record.state)
  }

  async #record(runId: string): Promise<RunRecord | null> {
    const memory = this.#records.get(runId)
    if (memory) {
      return memory
    }
    const state = await this.#store.load(runId)
    if (!state) {
      return null
    }
    const activity = await this.#store.readActivity(runId)
    const record = recordFromStored(state, activity.length)
    this.#records.set(runId, record)
    return record
  }

  async #publicState(record: RunRecord): Promise<TeamServerDevelopmentRunState> {
    if (!record.state.baseObjectId) {
      throw new Error('team_server_development_run_not_ready')
    }
    await record.logWrite
    const [activityLog, diffPatch] = await Promise.all([
      this.#store.readActivity(record.state.runId),
      this.#store.readDiff(record.state.runId)
    ])
    return {
      runId: record.state.runId,
      status: record.state.status,
      sequence: record.state.sequence,
      branchName: record.state.branchName,
      baseObjectId: record.state.baseObjectId,
      headObjectId: record.state.headObjectId,
      activityLog,
      logTruncated: record.state.logTruncated,
      diffPatch,
      diffTruncated: record.state.diffTruncated,
      failureCode: record.state.failureCode,
      updatedAt: record.state.updatedAt
    }
  }
}

function newRecord(runId: string, requestHash: string): RunRecord {
  return recordFromStored(
    {
      runId,
      requestHash,
      status: 'starting',
      sequence: 1,
      workspacePath: null,
      branchName: `teamrun/${runId}`,
      baseObjectId: null,
      headObjectId: null,
      logTruncated: false,
      diffTruncated: false,
      failureCode: null,
      updatedAt: new Date().toISOString()
    },
    0
  )
}

function recordFromStored(state: StoredTeamServerDevelopmentRun, activityChars: number): RunRecord {
  return {
    state,
    activityChars,
    logWrite: Promise.resolve(),
    sensitiveValues: [],
    pendingFailureCode: null,
    finished: false
  }
}

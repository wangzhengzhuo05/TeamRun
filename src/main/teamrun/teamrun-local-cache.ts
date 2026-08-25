import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import SyncDatabase from '../sqlite/sync-database'
import type { VerificationResult, WorkspaceRevision } from '../../shared/teamrun-api'
import {
  verificationResultSchema,
  workspaceRevisionSchema
} from '../../packages/teamrun-contracts/src/index'

export type TeamRunWorkspaceRecord = {
  clientRunId: string
  agentRunId: string
  workspaceId: string
  workspacePath: string
  taskId?: string
  baseRevision?: WorkspaceRevision
  createdAt: number
}

export type TeamRunPendingMutation = {
  id: string
  method: 'POST' | 'PATCH'
  path: string
  body: unknown
  idempotencyKey: string
  createdAt: number
}

function parseWorkspaceRevision(value: string | null): WorkspaceRevision | undefined {
  if (!value) return undefined
  try {
    const parsed = workspaceRevisionSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export class TeamRunLocalCache {
  #database: SyncDatabase | null = null

  constructor(private readonly databasePath?: string) {}

  getResponse(scope: string, path: string): unknown | null {
    const row = this.#db()
      .prepare('SELECT body FROM response_cache WHERE scope = ? AND path = ?')
      .get(scope, path) as { body?: unknown } | undefined
    if (typeof row?.body !== 'string') return null
    try {
      return JSON.parse(row.body)
    } catch {
      return null
    }
  }

  putResponse(scope: string, path: string, body: unknown): void {
    this.#db()
      .prepare(
        `INSERT INTO response_cache (scope, path, body, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (scope, path) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
      )
      .run(scope, path, JSON.stringify(body), Date.now())
  }

  getEventCursor(scope: string, organizationId: string): number {
    const row = this.#db()
      .prepare('SELECT cursor FROM event_cursors WHERE scope = ? AND organization_id = ?')
      .get(scope, organizationId) as { cursor?: unknown } | undefined
    return typeof row?.cursor === 'number' && Number.isSafeInteger(row.cursor) ? row.cursor : 0
  }

  putEventCursor(scope: string, organizationId: string, cursor: number): void {
    this.#db()
      .prepare(
        `INSERT INTO event_cursors (scope, organization_id, cursor, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (scope, organization_id) DO UPDATE SET
           cursor = MAX(event_cursors.cursor, excluded.cursor),
           updated_at = excluded.updated_at`
      )
      .run(scope, organizationId, cursor, Date.now())
  }

  enqueueMutation(scope: string, mutation: TeamRunPendingMutation): void {
    this.#db()
      .prepare(
        `INSERT OR IGNORE INTO mutation_outbox
           (scope, id, method, path, body, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        scope,
        mutation.id,
        mutation.method,
        mutation.path,
        JSON.stringify(mutation.body),
        mutation.idempotencyKey,
        mutation.createdAt
      )
  }

  listPendingMutations(scope: string): TeamRunPendingMutation[] {
    const rows = this.#db()
      .prepare(
        `SELECT id, method, path, body, idempotency_key, created_at
         FROM mutation_outbox WHERE scope = ? ORDER BY created_at, id`
      )
      .all(scope) as Array<{
      id: string
      method: 'POST' | 'PATCH'
      path: string
      body: string
      idempotency_key: string
      created_at: number
    }>
    return rows.flatMap((row) => {
      try {
        return [
          {
            id: row.id,
            method: row.method,
            path: row.path,
            body: JSON.parse(row.body) as unknown,
            idempotencyKey: row.idempotency_key,
            createdAt: row.created_at
          }
        ]
      } catch {
        this.deletePendingMutation(scope, row.id)
        return []
      }
    })
  }

  deletePendingMutation(scope: string, id: string): void {
    this.#db().prepare('DELETE FROM mutation_outbox WHERE scope = ? AND id = ?').run(scope, id)
  }

  putWorkspace(scope: string, record: Omit<TeamRunWorkspaceRecord, 'createdAt'>): void {
    this.#db()
      .prepare(
        `INSERT INTO workspace_links
           (scope, client_run_id, agent_run_id, workspace_id, workspace_path, task_id, base_revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (scope, client_run_id) DO UPDATE SET
           agent_run_id = excluded.agent_run_id,
           workspace_id = excluded.workspace_id,
           workspace_path = excluded.workspace_path,
           task_id = excluded.task_id,
           base_revision = excluded.base_revision`
      )
      .run(
        scope,
        record.clientRunId,
        record.agentRunId,
        record.workspaceId,
        record.workspacePath,
        record.taskId ?? null,
        record.baseRevision ? JSON.stringify(record.baseRevision) : null,
        Date.now()
      )
  }

  getWorkspace(scope: string, clientRunId: string): TeamRunWorkspaceRecord | null {
    const row = this.#db()
      .prepare(
        `SELECT client_run_id, agent_run_id, workspace_id, workspace_path, task_id, base_revision, created_at
         FROM workspace_links WHERE scope = ? AND client_run_id = ?`
      )
      .get(scope, clientRunId) as
      | {
          client_run_id: string
          agent_run_id: string
          workspace_id: string
          workspace_path: string
          task_id: string | null
          base_revision: string | null
          created_at: number
        }
      | undefined
    const baseRevision = parseWorkspaceRevision(row?.base_revision ?? null)
    return row
      ? {
          clientRunId: row.client_run_id,
          agentRunId: row.agent_run_id,
          workspaceId: row.workspace_id,
          workspacePath: row.workspace_path,
          ...(row.task_id ? { taskId: row.task_id } : {}),
          ...(baseRevision ? { baseRevision } : {}),
          createdAt: row.created_at
        }
      : null
  }

  putVerification(scope: string, result: VerificationResult): void {
    this.#db()
      .prepare(
        `INSERT INTO local_verification_results (scope, run_id, id, body, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (scope, id) DO UPDATE SET body = excluded.body`
      )
      .run(
        scope,
        result.agentRunId,
        result.id,
        JSON.stringify(result),
        Date.parse(result.createdAt)
      )
  }

  listVerifications(scope: string, runId: string): VerificationResult[] {
    const rows = this.#db()
      .prepare(
        `SELECT body FROM local_verification_results
         WHERE scope = ? AND run_id = ? ORDER BY created_at, id`
      )
      .all(scope, runId) as Array<{ body: string }>
    return rows.flatMap((row) => {
      try {
        const parsed = verificationResultSchema.safeParse(JSON.parse(row.body))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
  }

  close(): void {
    this.#database?.close()
    this.#database = null
  }

  #db(): SyncDatabase {
    if (this.#database) return this.#database
    const path = this.databasePath ?? join(app.getPath('userData'), 'teamrun', 'cache.sqlite')
    mkdirSync(dirname(path), { recursive: true })
    const database = new SyncDatabase(path)
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS response_cache (
        scope TEXT NOT NULL,
        path TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope, path)
      );
      CREATE TABLE IF NOT EXISTS workspace_links (
        scope TEXT NOT NULL,
        client_run_id TEXT NOT NULL,
        agent_run_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        task_id TEXT,
        base_revision TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (scope, client_run_id)
      );
      CREATE TABLE IF NOT EXISTS event_cursors (
        scope TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        cursor INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope, organization_id)
      );
      CREATE TABLE IF NOT EXISTS mutation_outbox (
        scope TEXT NOT NULL,
        id TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('POST', 'PATCH')),
        path TEXT NOT NULL,
        body TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (scope, id),
        UNIQUE (scope, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS local_verification_results (
        scope TEXT NOT NULL,
        run_id TEXT NOT NULL,
        id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (scope, id)
      );
      CREATE INDEX IF NOT EXISTS local_verification_results_run
        ON local_verification_results (scope, run_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_links_agent_run
        ON workspace_links (scope, agent_run_id);
    `)
    const workspaceColumns = database.pragma('table_info(workspace_links)') as { name: string }[]
    if (!workspaceColumns.some((column) => column.name === 'task_id')) {
      database.exec('ALTER TABLE workspace_links ADD COLUMN task_id TEXT;')
    }
    if (!workspaceColumns.some((column) => column.name === 'base_revision')) {
      database.exec('ALTER TABLE workspace_links ADD COLUMN base_revision TEXT;')
    }
    this.#database = database
    return database
  }
}

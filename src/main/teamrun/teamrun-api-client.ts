import { randomUUID } from 'node:crypto'
import type { VerificationResult } from '../../shared/teamrun-api'
import type { TeamRunApiError } from '../../shared/teamrun-cloud'
import { TeamRunAuthService } from './teamrun-auth-service'
import { TeamRunLocalCache } from './teamrun-local-cache'

const OUTBOX_SAFE_ROUTES = [
  /^POST \/v1\/organizations$/,
  /^POST \/v1\/organizations\/[^/]+\/projects$/,
  /^POST \/v1\/organizations\/[^/]+\/invitations$/,
  /^POST \/v1\/projects\/[^/]+\/tasks$/,
  /^POST \/v1\/projects\/[^/]+\/repositories$/,
  /^POST \/v1\/projects\/[^/]+\/channels$/,
  /^POST \/v1\/projects\/[^/]+\/team-agents$/,
  /^POST \/v1\/channels\/[^/]+\/messages$/,
  /^POST \/v1\/tasks\/[^/]+\/agent-runs$/,
  /^POST \/v1\/tasks\/[^/]+\/context-snapshots$/,
  /^POST \/v1\/tasks\/[^/]+\/comments$/,
  /^PATCH \/v1\/tasks\/[^/]+$/,
  /^PATCH \/v1\/projects\/[^/]+$/,
  /^PATCH \/v1\/agent-runs\/[^/]+\/status$/
]

function isOutboxSafe(method: string, path: string): method is 'POST' | 'PATCH' {
  return OUTBOX_SAFE_ROUTES.some((pattern) => pattern.test(`${method} ${path}`))
}

export class TeamRunApiClient {
  #connection: 'online' | 'offline' | 'blocked' = 'online'
  #lastError: string | undefined
  #flushPromise: Promise<void> | null = null

  constructor(
    readonly auth = new TeamRunAuthService(),
    readonly cache = new TeamRunLocalCache()
  ) {}

  async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      body?: unknown
      idempotencyKey?: string
      queueIfOffline?: boolean
      cache?: boolean
      timeoutMs?: number
    } = {}
  ): Promise<T> {
    const apiUrl = this.auth.apiUrl
    if (!apiUrl) {
      throw new Error('teamrun_api_unconfigured')
    }
    const method = options.method ?? 'GET'
    const scope = this.auth.cacheScope()
    const idempotencyKey =
      options.idempotencyKey ??
      (options.method === 'POST' || options.method === 'PATCH' ? randomUUID() : undefined)
    if (scope) {
      await this.flushPending()
      if (method !== 'GET' && this.cache.listPendingMutations(scope).length > 0) {
        this.#deferMutation({
          scope,
          method,
          path,
          body: options.body,
          idempotencyKey,
          queueIfOffline: options.queueIfOffline,
          fallback: new Error('TeamRun sync is blocked by an earlier offline change.')
        })
      }
    }
    let response: Response
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: {
          authorization: await this.auth.authorizationHeader(),
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
      })
    } catch (error) {
      this.#connection = 'offline'
      this.#lastError = error instanceof Error ? error.message : String(error)
      const cached =
        method === 'GET' && scope && options.cache !== false
          ? this.cache.getResponse(scope, path)
          : null
      if (cached !== null) {
        return cached as T
      }
      this.#deferMutation({
        scope,
        method,
        path,
        body: options.body,
        idempotencyKey,
        queueIfOffline: options.queueIfOffline,
        fallback: error
      })
    }
    this.#connection = 'online'
    this.#lastError = undefined
    if (response.status === 204) {
      return undefined as T
    }
    const body = (await response.json()) as T | Omit<TeamRunApiError, 'status'>
    if (!response.ok) {
      const error = body as Omit<TeamRunApiError, 'status'>
      throw Object.assign(
        new Error(error.message ?? `TeamRun API request failed (${response.status})`),
        {
          code: error.code ?? 'teamrun_api_error',
          requestId: error.requestId,
          status: response.status
        }
      )
    }
    if (method === 'GET' && scope && options.cache !== false) {
      this.cache.putResponse(scope, path, body)
    }
    return body as T
  }

  putWorkspaceLink(record: Parameters<TeamRunLocalCache['putWorkspace']>[1]): void {
    const scope = this.auth.cacheScope()
    if (!scope) {
      throw new Error('teamrun_authentication_required')
    }
    this.cache.putWorkspace(scope, record)
  }

  getWorkspaceLink(clientRunId: string) {
    const scope = this.auth.cacheScope()
    return scope ? this.cache.getWorkspace(scope, clientRunId) : null
  }

  putVerification(result: VerificationResult): void {
    const scope = this.auth.cacheScope()
    if (!scope) {
      throw new Error('teamrun_authentication_required')
    }
    this.cache.putVerification(scope, result)
  }

  listVerifications(runId: string) {
    const scope = this.auth.cacheScope()
    return scope ? this.cache.listVerifications(scope, runId) : []
  }

  syncStatus() {
    const scope = this.auth.cacheScope()
    return {
      connection: this.#connection,
      pendingMutations: scope ? this.cache.listPendingMutations(scope).length : 0,
      ...(this.#lastError ? { message: this.#lastError } : {})
    } as const
  }

  async flushPending(): Promise<void> {
    if (this.#flushPromise) {
      return this.#flushPromise
    }
    const scope = this.auth.cacheScope()
    const apiUrl = this.auth.apiUrl
    if (!scope || !apiUrl || this.cache.listPendingMutations(scope).length === 0) {
      return
    }
    this.#flushPromise = (async () => {
      try {
        const authorization = await this.auth.authorizationHeader()
        for (const mutation of this.cache.listPendingMutations(scope)) {
          const response = await fetch(`${apiUrl}${mutation.path}`, {
            method: mutation.method,
            headers: {
              authorization,
              'content-type': 'application/json',
              'idempotency-key': mutation.idempotencyKey
            },
            body: JSON.stringify(mutation.body),
            signal: AbortSignal.timeout(30_000)
          })
          if (!response.ok) {
            const problem = (await response.json().catch(() => null)) as { message?: string } | null
            this.#connection = 'blocked'
            this.#lastError = problem?.message ?? `TeamRun sync failed (${response.status})`
            return
          }
          this.cache.deletePendingMutation(scope, mutation.id)
        }
        this.#connection = 'online'
        this.#lastError = undefined
      } catch (error) {
        this.#connection = 'offline'
        this.#lastError = error instanceof Error ? error.message : String(error)
      }
    })().finally(() => {
      this.#flushPromise = null
    })
    return this.#flushPromise
  }

  #deferMutation(args: {
    scope: string | null
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    path: string
    body: unknown
    idempotencyKey: string | undefined
    queueIfOffline: boolean | undefined
    fallback: unknown
  }): never {
    if (
      args.scope &&
      args.idempotencyKey &&
      args.queueIfOffline !== false &&
      isOutboxSafe(args.method, args.path)
    ) {
      this.cache.enqueueMutation(args.scope, {
        id: randomUUID(),
        method: args.method,
        path: args.path,
        body: args.body,
        idempotencyKey: args.idempotencyKey,
        createdAt: Date.now()
      })
      const message =
        this.#connection === 'blocked'
          ? 'Saved for later. Resolve the earlier TeamRun sync error before this change can sync.'
          : 'Saved offline. TeamRun will sync this change when the connection returns.'
      throw Object.assign(new Error(message), { code: 'teamrun_mutation_queued' })
    }
    throw args.fallback
  }
}

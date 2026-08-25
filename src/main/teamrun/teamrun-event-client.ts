import type { WebContents } from 'electron'
import { teamEventSchema } from '../../packages/teamrun-contracts/src/index'
import { TeamRunApiClient } from './teamrun-api-client'

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

export class TeamRunEventClient {
  readonly #subscriptions = new Map<number, AbortController>()

  constructor(private readonly client: TeamRunApiClient) {}

  start(sender: WebContents, organizationId: string, initialCursor?: number): void {
    this.stop(sender.id)
    const controller = new AbortController()
    this.#subscriptions.set(sender.id, controller)
    sender.once('destroyed', () => controller.abort())
    const scope = this.client.auth.cacheScope()
    const cursor =
      initialCursor ?? (scope ? this.client.cache.getEventCursor(scope, organizationId) : 0)
    sender.send('teamrun:sync:status', {
      ...this.client.syncStatus(),
      connection: 'connecting',
      cursor
    })
    void this.#consume(sender, organizationId, cursor, controller.signal).finally(() => {
      if (this.#subscriptions.get(sender.id) === controller) this.#subscriptions.delete(sender.id)
    })
  }

  stop(senderId: number): void {
    this.#subscriptions.get(senderId)?.abort()
    this.#subscriptions.delete(senderId)
  }

  async #consume(
    sender: WebContents,
    organizationId: string,
    initialCursor: number,
    signal: AbortSignal
  ): Promise<void> {
    let cursor = initialCursor
    let retryMs = 1000
    while (!signal.aborted && !sender.isDestroyed()) {
      try {
        cursor = await this.#connect(sender, organizationId, cursor, signal)
        retryMs = 1000
      } catch (error) {
        if (signal.aborted) return
        const message = error instanceof Error ? error.message : 'Event stream failed'
        sender.send('teamrun:sync:status', {
          ...this.client.syncStatus(),
          connection: 'offline',
          cursor,
          message
        })
        sender.send('teamrun:events:error', message)
      }
      await abortableDelay(retryMs, signal)
      retryMs = Math.min(retryMs * 2, 30_000)
    }
  }

  async #connect(
    sender: WebContents,
    organizationId: string,
    initialCursor: number,
    signal: AbortSignal
  ): Promise<number> {
    await this.client.flushPending()
    const apiUrl = this.client.auth.apiUrl
    if (!apiUrl) throw new Error('teamrun_api_unconfigured')
    const url = new URL('/v1/events', apiUrl)
    url.searchParams.set('organizationId', organizationId)
    url.searchParams.set('cursor', String(initialCursor))
    const response = await fetch(url, {
      headers: {
        accept: 'text/event-stream',
        authorization: await this.client.auth.authorizationHeader(),
        'last-event-id': String(initialCursor)
      },
      signal
    })
    if (!response.ok || !response.body)
      throw new Error(`TeamRun event stream failed (${response.status})`)
    sender.send('teamrun:sync:status', {
      ...this.client.syncStatus(),
      connection: 'online',
      cursor: initialCursor
    })
    let cursor = initialCursor
    let buffer = ''
    const decoder = new TextDecoder()
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) {
          try {
            const parsed = teamEventSchema.safeParse(JSON.parse(data))
            if (parsed.success) {
              cursor = parsed.data.cursor
              const scope = this.client.auth.cacheScope()
              if (scope) this.client.cache.putEventCursor(scope, organizationId, cursor)
              if (!sender.isDestroyed()) sender.send('teamrun:event', parsed.data)
            }
          } catch {
            // Ignore malformed frames and resume from the last durable cursor.
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
    return cursor
  }
}

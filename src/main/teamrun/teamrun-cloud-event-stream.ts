import { teamEventSchema } from '../../packages/teamrun-contracts/src/index'
import type { TeamEvent } from '../../shared/teamrun-api'
import type { TeamRunSyncStatus } from '../../shared/teamrun-cloud'
import { TeamRunApiClient } from './teamrun-api-client'

export type TeamRunCloudEventFrame =
  | { type: 'status'; status: TeamRunSyncStatus }
  | { type: 'event'; event: TeamEvent }
  | { type: 'error'; message: string }

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

export async function streamTeamRunCloudEvents(
  client: TeamRunApiClient,
  organizationId: string,
  initialCursor: number | undefined,
  signal: AbortSignal,
  emit: (frame: TeamRunCloudEventFrame) => void
): Promise<void> {
  const scope = client.auth.cacheScope()
  let cursor = initialCursor ?? (scope ? client.cache.getEventCursor(scope, organizationId) : 0)
  let retryMs = 1000
  emit({ type: 'status', status: { ...client.syncStatus(), connection: 'connecting', cursor } })
  while (!signal.aborted) {
    try {
      cursor = await connectTeamRunCloudEvents(client, organizationId, cursor, signal, emit)
      retryMs = 1000
    } catch (error) {
      if (signal.aborted) return
      const message = error instanceof Error ? error.message : 'Event stream failed'
      emit({
        type: 'status',
        status: { ...client.syncStatus(), connection: 'offline', cursor, message }
      })
      emit({ type: 'error', message })
    }
    await abortableDelay(retryMs, signal)
    retryMs = Math.min(retryMs * 2, 30_000)
  }
}

async function connectTeamRunCloudEvents(
  client: TeamRunApiClient,
  organizationId: string,
  initialCursor: number,
  signal: AbortSignal,
  emit: (frame: TeamRunCloudEventFrame) => void
): Promise<number> {
  await client.flushPending()
  const apiUrl = client.auth.apiUrl
  if (!apiUrl) throw new Error('teamrun_api_unconfigured')
  const url = new URL('/v1/events', apiUrl)
  url.searchParams.set('organizationId', organizationId)
  url.searchParams.set('cursor', String(initialCursor))
  const response = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
      authorization: await client.auth.authorizationHeader(),
      'last-event-id': String(initialCursor)
    },
    signal
  })
  if (!response.ok || !response.body) {
    throw new Error(`TeamRun event stream failed (${response.status})`)
  }
  emit({
    type: 'status',
    status: { ...client.syncStatus(), connection: 'online', cursor: initialCursor }
  })
  return consumeEventBody(client, organizationId, initialCursor, response.body, emit)
}

async function consumeEventBody(
  client: TeamRunApiClient,
  organizationId: string,
  initialCursor: number,
  body: ReadableStream<Uint8Array>,
  emit: (frame: TeamRunCloudEventFrame) => void
): Promise<number> {
  let cursor = initialCursor
  let buffer = ''
  const decoder = new TextDecoder()
  for await (const chunk of body) {
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
            const scope = client.auth.cacheScope()
            if (scope) client.cache.putEventCursor(scope, organizationId, cursor)
            emit({ type: 'event', event: parsed.data })
          }
        } catch {
          // Resume from the last durable cursor after a malformed frame.
        }
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
  return cursor
}

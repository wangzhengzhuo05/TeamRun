import { and, asc, eq, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { teamEvents } from '../database/schema.js'

const eventQuerySchema = z.object({
  organizationId: z.uuid(),
  cursor: z.coerce.number().int().nonnegative().optional()
})

function writeSseEvent(
  response: NodeJS.WritableStream,
  event: typeof teamEvents.$inferSelect
): void {
  response.write(`id: ${event.cursor}\n`)
  response.write(`event: ${event.type}\n`)
  response.write(
    `data: ${JSON.stringify({
      cursor: event.cursor,
      organizationId: event.organizationId,
      type: event.type,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      occurredAt: event.occurredAt.toISOString(),
      data: event.data
    })}\n\n`
  )
}

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/events', async (request, reply) => {
    const query = eventQuerySchema.parse(request.query)
    await requireOrganizationRole(app.teamRunDatabase, query.organizationId, request.teamRunUser.id)
    const headerCursor = z.coerce
      .number()
      .int()
      .nonnegative()
      .safeParse(request.headers['last-event-id'])
    let cursor = query.cursor ?? (headerCursor.success ? headerCursor.data : 0)
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    reply.raw.write(': connected\n\n')

    let polling = false
    let pending = true
    const drain = async () => {
      if (polling || reply.raw.destroyed) {
        return
      }
      polling = true
      try {
        try {
          await requireOrganizationRole(
            app.teamRunDatabase,
            query.organizationId,
            request.teamRunUser.id
          )
        } catch {
          reply.raw.end()
          return
        }
        while (pending && !reply.raw.destroyed) {
          pending = false
          const events = await app.teamRunDatabase
            .select()
            .from(teamEvents)
            .where(
              and(
                eq(teamEvents.organizationId, query.organizationId),
                gt(teamEvents.cursor, cursor)
              )
            )
            .orderBy(asc(teamEvents.cursor))
            .limit(200)
          for (const event of events) {
            writeSseEvent(reply.raw, event)
            cursor = event.cursor
          }
          if (events.length === 200) pending = true
        }
      } finally {
        polling = false
        if (pending && !reply.raw.destroyed) void drain()
      }
    }
    const unsubscribe = app.teamRunEventNotifier.subscribe(query.organizationId, () => {
      pending = true
      void drain()
    })
    await drain()
    const heartbeatTimer = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': heartbeat\n\n')
      }
    }, 15_000)
    request.raw.once('close', () => {
      unsubscribe()
      clearInterval(heartbeatTimer)
    })
  })
}

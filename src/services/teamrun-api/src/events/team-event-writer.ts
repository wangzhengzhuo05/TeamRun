import type { TeamEventType } from '@teamrun/contracts'
import { sql } from 'drizzle-orm'
import { auditLogs, teamEvents } from '../database/schema.js'
import type { TeamRunTransaction } from '../http/idempotent-mutation.js'
import { TEAM_EVENT_CHANNEL } from './team-event-notifier.js'

export async function appendTeamEvent(
  transaction: TeamRunTransaction,
  args: {
    organizationId: string
    type: TeamEventType
    entityId: string
    actorUserId: string
    data?: Record<string, unknown>
    auditAction?: string
  }
): Promise<void> {
  const [event] = await transaction
    .insert(teamEvents)
    .values({
      organizationId: args.organizationId,
      type: args.type,
      entityId: args.entityId,
      actorUserId: args.actorUserId,
      data: args.data ?? {}
    })
    .returning({ cursor: teamEvents.cursor })
  await transaction.execute(
    sql`select pg_notify(${TEAM_EVENT_CHANNEL}, ${JSON.stringify({ organizationId: args.organizationId, cursor: event?.cursor })})`
  )
  if (args.auditAction) {
    await transaction.insert(auditLogs).values({
      organizationId: args.organizationId,
      actorUserId: args.actorUserId,
      action: args.auditAction,
      entityId: args.entityId,
      data: args.data ?? {}
    })
  }
}

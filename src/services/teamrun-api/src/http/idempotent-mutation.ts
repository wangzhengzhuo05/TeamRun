import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { TeamRunDatabase } from '../database/connection.js'
import { idempotencyRecords } from '../database/schema.js'
import { ApiProblem } from './api-problem.js'

export type TeamRunTransaction = Parameters<Parameters<TeamRunDatabase['transaction']>[0]>[0]

type MutationResult = { status: number; body: unknown }

function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim()
  if (!key || key.length > 200) {
    throw new ApiProblem(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key must contain 1-200 characters'
    )
  }
  return key
}

export async function runIdempotentMutation(
  db: TeamRunDatabase,
  args: {
    userId: string
    route: string
    key: string
    requestBody: unknown
    execute: (transaction: TeamRunTransaction) => Promise<MutationResult>
  }
): Promise<MutationResult & { replayed: boolean }> {
  const hash = requestHash(args.requestBody)
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${args.userId}:${args.route}:${args.key}`}))`
    )
    const [existing] = await transaction
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, args.userId),
          eq(idempotencyRecords.route, args.route),
          eq(idempotencyRecords.key, args.key)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ApiProblem(
          409,
          'idempotency_conflict',
          'Idempotency key was already used with a different request'
        )
      }
      return {
        status: existing.responseStatus,
        body: existing.responseBody,
        replayed: true
      }
    }
    const result = await args.execute(transaction)
    await transaction.insert(idempotencyRecords).values({
      userId: args.userId,
      route: args.route,
      key: args.key,
      requestHash: hash,
      responseStatus: result.status,
      responseBody: result.body
    })
    return { ...result, replayed: false }
  })
}

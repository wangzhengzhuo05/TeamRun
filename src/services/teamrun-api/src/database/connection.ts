import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { TeamRunServiceConfig } from '../service-config.js'
import * as schema from './schema.js'

export function createTeamRunDatabase(config: TeamRunServiceConfig) {
  const client = postgres(config.DATABASE_URL, {
    max: config.NODE_ENV === 'test' ? 4 : 20,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  })
  return {
    client,
    db: drizzle(client, { schema })
  }
}

export type TeamRunDatabase = ReturnType<typeof createTeamRunDatabase>['db']

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createTeamRunDatabase } from './connection.js'
import { readTeamRunServiceConfig } from '../service-config.js'

const config = readTeamRunServiceConfig()
const { client, db } = createTeamRunDatabase(config)
const serviceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

try {
  await migrate(db, { migrationsFolder: join(serviceRoot, 'migrations') })
} finally {
  await client.end()
}

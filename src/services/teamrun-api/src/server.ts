import { createTeamRunApp } from './app.js'
import { readTeamRunServiceConfig } from './service-config.js'

const config = readTeamRunServiceConfig()
const app = await createTeamRunApp(config)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(() => process.exit(0))
  })
}

await app.listen({ host: config.HOST, port: config.PORT })

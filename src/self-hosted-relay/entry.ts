#!/usr/bin/env node
import { SelfHostedRelayServer } from './self-hosted-relay-server'
import { readSelfHostedRelayServerConfig } from './relay-server-config'

async function main(): Promise<void> {
  const config = readSelfHostedRelayServerConfig()
  const server = new SelfHostedRelayServer(config)
  await server.start()
  console.log(
    JSON.stringify({
      type: 'orca_self_hosted_relay_ready',
      publicUrl: config.publicUrl,
      listen: `${config.host}:${config.port}`,
      dataPath: config.dataPath
    })
  )
  let stopping = false
  const stop = (): void => {
    if (stopping) {
      return
    }
    stopping = true
    void server.stop().finally(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

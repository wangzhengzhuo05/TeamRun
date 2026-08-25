import type { FastifyReply, FastifyRequest } from 'fastify'
import type { TeamRunDatabase } from '../database/connection.js'
import type { TeamRunServiceConfig } from '../service-config.js'
import type { TeamEventNotifier } from '../events/team-event-notifier.js'

export type TeamRunUser = {
  id: string
  oidcSubject: string
  email: string
  displayName: string
}

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean
  }

  interface FastifyInstance {
    teamRunConfig: TeamRunServiceConfig
    teamRunDatabase: TeamRunDatabase
    teamRunEventNotifier: TeamEventNotifier
    authenticateTeamRunRequest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    teamRunUser: TeamRunUser
  }
}

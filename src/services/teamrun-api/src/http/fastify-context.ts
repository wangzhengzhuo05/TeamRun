import type { FastifyReply } from 'fastify'
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
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface FastifyContextConfig {
    public?: boolean
  }

  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface FastifyInstance {
    teamRunConfig: TeamRunServiceConfig
    teamRunDatabase: TeamRunDatabase
    teamRunEventNotifier: TeamEventNotifier
    authenticateTeamRunRequest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface FastifyRequest {
    teamRunUser: TeamRunUser
  }
}

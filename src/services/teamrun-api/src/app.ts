import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { ZodError } from 'zod'
import { registerAuthentication } from './auth/authentication.js'
import { createTeamRunDatabase } from './database/connection.js'
import { ApiProblem } from './http/api-problem.js'
import './http/fastify-context.js'
import { registerAgentRunRoutes } from './routes/agent-run-routes.js'
import { registerCollaborationRoutes } from './routes/collaboration-routes.js'
import { registerEventRoutes } from './routes/event-routes.js'
import { registerOrganizationRoutes } from './routes/organization-routes.js'
import { registerProjectRoutes } from './routes/project-routes.js'
import { registerPublicationRoutes } from './routes/publication-routes.js'
import { registerTaskRoutes } from './routes/task-routes.js'
import { registerTaskContextRoutes } from './routes/task-context-routes.js'
import { registerTeamFileRoutes } from './routes/team-file-routes.js'
import type { TeamRunServiceConfig } from './service-config.js'
import { TEAM_EVENT_CHANNEL, TeamEventNotifier } from './events/team-event-notifier.js'

export async function createTeamRunApp(config: TeamRunServiceConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.body', 'res.body']
    },
    bodyLimit: 1_200_000,
    requestIdHeader: 'x-request-id'
  })
  const { client, db } = createTeamRunDatabase(config)
  const eventNotifier = new TeamEventNotifier()
  const eventListener = await client.listen(TEAM_EVENT_CHANNEL, (payload) =>
    eventNotifier.notify(payload)
  )
  app.decorate('teamRunConfig', config)
  app.decorate('teamRunDatabase', db)
  app.decorate('teamRunEventNotifier', eventNotifier)
  app.addHook('onClose', async () => {
    await eventListener.unlisten()
    await client.end()
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: config.TEAMRUN_CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'last-event-id'],
    exposedHeaders: ['idempotency-replayed']
  })
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.teamRunUser?.id ?? request.ip
  })
  registerAuthentication(app)

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: 'invalid_request',
        message: 'Request validation failed',
        requestId: request.id,
        details: { issues: error.issues }
      })
    }
    if (error instanceof ApiProblem) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
        ...(error.details ? { details: error.details } : {})
      })
    }
    request.log.error({ err: error }, 'Unhandled TeamRun API error')
    return reply.code(500).send({
      code: 'internal_error',
      message: 'An unexpected error occurred',
      requestId: request.id
    })
  })

  app.get('/health', { config: { public: true } }, async () => {
    await db.execute(sql`select 1`)
    return { status: 'ok' }
  })
  app.get('/v1/auth/config', { config: { public: true } }, async () => ({
    issuer: config.TEAMRUN_OIDC_ISSUER ?? null,
    audience: config.TEAMRUN_OIDC_AUDIENCE ?? null,
    clientId: config.TEAMRUN_OIDC_CLIENT_ID ?? null,
    devAuth: config.TEAMRUN_DEV_AUTH === '1',
    sharedKeyAuth: Boolean(config.TEAMRUN_SHARED_KEY)
  }))
  app.get('/v1/auth/me', async (request) => ({
    userId: request.teamRunUser.id,
    email: request.teamRunUser.email,
    displayName: request.teamRunUser.displayName
  }))

  await registerOrganizationRoutes(app)
  await registerProjectRoutes(app)
  await registerCollaborationRoutes(app)
  await registerTaskRoutes(app)
  await registerTaskContextRoutes(app)
  await registerTeamFileRoutes(app)
  await registerAgentRunRoutes(app)
  await registerPublicationRoutes(app)
  await registerEventRoutes(app)
  return app
}

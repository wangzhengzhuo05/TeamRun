import { sql } from 'drizzle-orm'
import type { TeamAgentSnapshot, WorkspaceRevision } from '@teamrun/contracts'
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { organizations, projects, repositories, timestamps, users } from './workspace-schema.js'

export {
  organizationInvitations,
  organizationMembers,
  organizationRoleEnum,
  organizations,
  invitationStatusEnum,
  projects,
  repositories,
  users
} from './workspace-schema.js'
export { channelMessages, channels, teamAgents } from './collaboration-schema.js'

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled'
])
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'queued',
  'starting',
  'working',
  'needs_input',
  'review',
  'completed',
  'failed',
  'canceled'
])
export const publicationStateEnum = pgEnum('publication_state', [
  'preparing',
  'finalized',
  'expired'
])
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'set null' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    descriptionMarkdown: text('description_markdown').notNull().default(''),
    status: taskStatusEnum('status').notNull().default('todo'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    version: integer('version').notNull().default(1),
    externalSource: jsonb('external_source'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('tasks_project_number').on(table.projectId, table.number),
    index('tasks_organization_updated').on(table.organizationId, table.updatedAt)
  ]
)

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    bodyMarkdown: text('body_markdown').notNull(),
    ...timestamps
  },
  (table) => [index('task_comments_task_created').on(table.taskId, table.createdAt)]
)

export const contextSnapshots = pgTable(
  'context_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    taskVersion: integer('task_version').notNull(),
    projectContextVersion: integer('project_context_version').notNull(),
    commentWatermark: timestamp('comment_watermark', { withTimezone: true }),
    renderedMarkdown: text('rendered_markdown').notNull(),
    hash: text('hash').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('context_snapshots_task_created').on(table.taskId, table.createdAt)]
)

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    contextSnapshotId: uuid('context_snapshot_id')
      .notNull()
      .references(() => contextSnapshots.id),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    agentKind: text('agent_kind').notNull(),
    teamAgentSnapshot: jsonb('team_agent_snapshot').$type<TeamAgentSnapshot>(),
    status: agentRunStatusEnum('status').notNull().default('queued'),
    stale: boolean('stale').notNull().default(false),
    baseRevision: jsonb('base_revision').$type<WorkspaceRevision>().notNull(),
    clientRunId: text('client_run_id').notNull(),
    lastSequence: integer('last_sequence').notNull().default(0),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('agent_runs_owner_client').on(table.ownerUserId, table.clientRunId),
    index('agent_runs_task_updated').on(table.taskId, table.updatedAt)
  ]
)

export const verificationResults = pgTable('verification_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentRunId: uuid('agent_run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  commandId: text('command_id').notNull(),
  commandLabel: text('command_label').notNull(),
  command: text('command').notNull(),
  exitCode: integer('exit_code').notNull(),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  output: text('output').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
})

export const publications = pgTable(
  'publications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentRunId: uuid('agent_run_id')
      .notNull()
      .references(() => agentRuns.id),
    revision: integer('revision'),
    state: publicationStateEnum('state').notNull().default('preparing'),
    summaryMarkdown: text('summary_markdown').notNull(),
    headRevision: jsonb('head_revision').$type<WorkspaceRevision>().notNull(),
    commitGitObjectIds: jsonb('commit_git_object_ids').notNull(),
    reviewUrl: text('review_url'),
    artifacts: jsonb('artifacts').notNull(),
    publishedByUserId: uuid('published_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('publications_task_revision')
      .on(table.taskId, table.revision)
      .where(sql`${table.revision} is not null`),
    uniqueIndex('publications_agent_run_finalized')
      .on(table.agentRunId)
      .where(sql`${table.state} = 'finalized'`)
  ]
)

export const teamEvents = pgTable(
  'team_events',
  {
    cursor: bigserial('cursor', { mode: 'number' }).primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    data: jsonb('data').notNull().default({})
  },
  (table) => [index('team_events_organization_cursor').on(table.organizationId, table.cursor)]
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    entityId: uuid('entity_id'),
    data: jsonb('data').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('audit_logs_organization_id').on(table.organizationId, table.id)]
)

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    route: text('route').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.route, table.key] })]
)

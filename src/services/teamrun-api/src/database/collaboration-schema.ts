import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organizations, projects, timestamps, users } from './workspace-schema.js'

export const teamServerBindings = pgTable(
  'team_server_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    endpoint: text('endpoint').notNull(),
    runtimeId: text('runtime_id').notNull(),
    pairedDeviceId: text('paired_device_id'),
    encryptedPairingOffer: text('encrypted_pairing_offer').notNull(),
    version: integer('version').notNull().default(1),
    enrolledByUserId: uuid('enrolled_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (table) => [
    uniqueIndex('team_server_bindings_organization').on(table.organizationId),
    uniqueIndex('team_server_bindings_project').on(table.projectId)
  ]
)

export const modelConnections = pgTable(
  'model_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    model: text('model').notNull(),
    keyConfigured: boolean('key_configured').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (table) => [uniqueIndex('model_connections_project_name').on(table.projectId, table.name)]
)

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (table) => [uniqueIndex('channels_project_name').on(table.projectId, table.name)]
)

export const teamAgents = pgTable(
  'team_agents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    agentKind: text('agent_kind').notNull(),
    launchCommand: text('launch_command'),
    modelConnectionId: uuid('model_connection_id').references(() => modelConnections.id, {
      onDelete: 'restrict'
    }),
    yoloMode: boolean('yolo_mode').notNull().default(false),
    instructionsMarkdown: text('instructions_markdown').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (table) => [uniqueIndex('team_agents_project_name').on(table.projectId, table.name)]
)

export const channelMessages = pgTable(
  'channel_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    authorTeamAgentId: uuid('author_team_agent_id').references(() => teamAgents.id, {
      onDelete: 'set null'
    }),
    bodyMarkdown: text('body_markdown').notNull(),
    ...timestamps
  },
  (table) => [index('channel_messages_channel_created').on(table.channelId, table.createdAt)]
)

export const teamAgentReplyInvocations = pgTable(
  'team_agent_reply_invocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    teamAgentId: uuid('team_agent_id')
      .notNull()
      .references(() => teamAgents.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull(),
    resultMessageId: uuid('result_message_id').references(() => channelMessages.id, {
      onDelete: 'set null'
    }),
    errorCode: text('error_code'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('team_agent_reply_invocations_request').on(
      table.requestedByUserId,
      table.channelId,
      table.idempotencyKey
    ),
    index('team_agent_reply_invocations_channel_created').on(table.channelId, table.createdAt)
  ]
)

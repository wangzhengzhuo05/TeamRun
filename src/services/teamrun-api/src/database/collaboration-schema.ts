import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organizations, projects, timestamps, users } from './workspace-schema.js'

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

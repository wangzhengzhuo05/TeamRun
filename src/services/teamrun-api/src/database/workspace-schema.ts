import { sql } from 'drizzle-orm'
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

export const organizationRoleEnum = pgEnum('organization_role', ['owner', 'admin', 'member'])
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked'])

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  oidcSubject: text('oidc_subject').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  ...timestamps
})

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps
})

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRoleEnum('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })]
)

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: organizationRoleEnum('role').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('organization_invitations_pending_email')
      .on(table.organizationId, table.email)
      .where(sql`${table.status} = 'pending'`)
  ]
)

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    contextMarkdown: text('context_markdown').notNull().default(''),
    contextVersion: integer('context_version').notNull().default(0),
    nextTaskNumber: integer('next_task_number').notNull().default(1),
    ...timestamps
  },
  (table) => [uniqueIndex('projects_organization_key').on(table.organizationId, table.key)]
)

export const repositories = pgTable(
  'repositories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    remoteUrl: text('remote_url').notNull(),
    displayName: text('display_name').notNull(),
    defaultBranch: text('default_branch').notNull(),
    ...timestamps
  },
  (table) => [uniqueIndex('repositories_project_remote').on(table.projectId, table.remoteUrl)]
)

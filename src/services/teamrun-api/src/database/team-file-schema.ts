import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { organizations, projects, timestamps, users } from './workspace-schema.js'

export const teamFileKindEnum = pgEnum('team_file_kind', ['document', 'code', 'file'])
export const teamFileAvailabilityEnum = pgEnum('team_file_availability', [
  'available',
  'quarantined'
])

export const teamFiles = pgTable(
  'team_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    kind: teamFileKindEnum('kind').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    currentMimeType: text('current_mime_type').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('team_files_project_path')
      .on(table.projectId, table.path)
      .where(sql`${table.deletedAt} is null`)
  ]
)

export const teamFileVersions = pgTable(
  'team_file_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamFileId: uuid('team_file_id')
      .notNull()
      .references(() => teamFiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    contentBase64: text('content_base64').notNull(),
    availability: teamFileAvailabilityEnum('availability').notNull().default('available'),
    quarantineReason: text('quarantine_reason'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('team_file_versions_file_version').on(table.teamFileId, table.version),
    index('team_file_versions_project_created').on(table.projectId, table.createdAt)
  ]
)

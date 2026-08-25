import { z } from 'zod'
import {
  entityIdSchema,
  markdownSchema,
  sha256Schema,
  timestampSchema,
  versionSchema
} from './scalars.js'

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'in_review', 'done', 'canceled'])
export const externalTaskProviderSchema = z.enum(['github', 'gitlab', 'linear', 'jira'])

export const externalTaskSourceSchema = z.object({
  provider: externalTaskProviderSchema,
  externalId: z.string().min(1).max(512),
  url: z.url(),
  importedAt: timestampSchema,
  importedMarkdown: markdownSchema
})

export const taskSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  repositoryId: entityIdSchema.nullable(),
  number: z.number().int().positive(),
  title: z.string().min(1).max(500),
  descriptionMarkdown: markdownSchema,
  status: taskStatusSchema,
  ownerUserId: entityIdSchema,
  version: versionSchema,
  externalSource: externalTaskSourceSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const taskCommentSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  taskId: entityIdSchema,
  authorUserId: entityIdSchema,
  bodyMarkdown: markdownSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const contextSnapshotSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  taskId: entityIdSchema,
  taskVersion: versionSchema,
  projectContextVersion: z.number().int().nonnegative(),
  commentWatermark: timestampSchema.nullable(),
  renderedMarkdown: markdownSchema,
  hash: sha256Schema,
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema
})

export const createTaskRequestSchema = z.object({
  repositoryId: entityIdSchema.nullable().optional(),
  title: z.string().min(1).max(500),
  descriptionMarkdown: markdownSchema.default(''),
  ownerUserId: entityIdSchema.optional(),
  externalSource: externalTaskSourceSchema.omit({ importedAt: true }).optional()
})

export const updateTaskRequestSchema = z.object({
  version: versionSchema,
  repositoryId: entityIdSchema.nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  descriptionMarkdown: markdownSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  status: taskStatusSchema.optional()
})

export const createTaskCommentRequestSchema = z.object({ bodyMarkdown: markdownSchema.min(1) })

export const createContextSnapshotRequestSchema = z.object({
  taskVersion: versionSchema,
  includeComments: z.boolean().default(true),
  includeProjectContext: z.boolean().default(true),
  includeExternalSource: z.boolean().default(true)
})

export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>
export type ExternalTaskSource = z.infer<typeof externalTaskSourceSchema>
export type Task = z.infer<typeof taskSchema>
export type TaskComment = z.infer<typeof taskCommentSchema>
export type TaskStatus = z.infer<typeof taskStatusSchema>
export type CreateTaskRequest = z.input<typeof createTaskRequestSchema>
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>
export type CreateTaskCommentRequest = z.infer<typeof createTaskCommentRequestSchema>
export type CreateContextSnapshotRequest = z.input<typeof createContextSnapshotRequestSchema>

import { z } from 'zod'
import { entityIdSchema, gitObjectIdSchema, sha256Schema, timestampSchema } from './scalars.js'
import { workspaceRevisionSchema, type WorkspaceRevision } from './agent-run-contracts.js'

export const verificationResultSchema = z.object({
  id: entityIdSchema,
  agentRunId: entityIdSchema,
  commandId: z.string().min(1).max(120),
  commandLabel: z.string().min(1).max(240),
  command: z.string().min(1).max(16_384),
  exitCode: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  output: z.string().max(65_536),
  createdAt: timestampSchema
})

export const createVerificationResultRequestSchema = verificationResultSchema.omit({
  id: true,
  agentRunId: true,
  createdAt: true
})

export const publicationArtifactKindSchema = z.enum([
  'unified_diff',
  'verification_output',
  'binary_metadata'
])

export const publicationArtifactSelectionSchema = z.object({
  clientArtifactId: z.string().min(1).max(160),
  kind: publicationArtifactKindSchema,
  fileName: z.string().min(1).max(500),
  contentType: z.string().min(1).max(160),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(5 * 1024 * 1024),
  sha256: sha256Schema
})

export const preparePublicationRequestSchema = z.object({
  agentRunId: entityIdSchema,
  summaryMarkdown: z.string().max(200_000),
  headRevision: workspaceRevisionSchema,
  commitGitObjectIds: z.array(gitObjectIdSchema).max(500),
  reviewUrl: z.url().nullable().optional(),
  artifacts: z.array(publicationArtifactSelectionSchema).max(100)
})

export const preparedArtifactUploadSchema = publicationArtifactSelectionSchema.extend({
  uploadUrl: z.url(),
  requiredHeaders: z.record(z.string(), z.string())
})

export const publicationArtifactSchema = publicationArtifactSelectionSchema.extend({
  downloadUrl: z.url(),
  expiresAt: timestampSchema
})

export const preparedPublicationSchema = z.object({
  publicationId: entityIdSchema,
  expiresAt: timestampSchema,
  uploads: z.array(preparedArtifactUploadSchema)
})

export const resultPublicationSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  taskId: entityIdSchema,
  agentRunId: entityIdSchema,
  revision: z.number().int().positive(),
  summaryMarkdown: z.string().max(200_000),
  headRevision: workspaceRevisionSchema,
  commitGitObjectIds: z.array(gitObjectIdSchema),
  reviewUrl: z.url().nullable(),
  publishedByUserId: entityIdSchema,
  publishedAt: timestampSchema
})

export const finalizePublicationRequestSchema = z.object({
  artifactReceipts: z.array(
    z.object({ clientArtifactId: z.string().min(1).max(160), sha256: sha256Schema })
  )
})

export type PreparedPublication = z.infer<typeof preparedPublicationSchema>
export type PublicationArtifact = z.infer<typeof publicationArtifactSchema>
export type ResultPublication = z.infer<typeof resultPublicationSchema>
export type VerificationResult = z.infer<typeof verificationResultSchema>
export type CreateVerificationResultRequest = z.infer<typeof createVerificationResultRequestSchema>
export type PreparePublicationRequest = z.infer<typeof preparePublicationRequestSchema>
export type FinalizePublicationRequest = z.infer<typeof finalizePublicationRequestSchema>
export type { WorkspaceRevision }

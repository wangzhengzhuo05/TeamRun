import { z } from 'zod'
import { entityIdSchema, sha256Schema, timestampSchema, versionSchema } from './scalars.js'

export const teamFileKindSchema = z.enum(['document', 'code', 'file'])
export const teamFileAvailabilitySchema = z.enum(['available', 'quarantined'])
export const teamFileProposalStatusSchema = z.enum(['running', 'ready', 'applied', 'failed'])

export const teamFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.endsWith('/') &&
      !value.includes('\\') &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a relative Team File path without traversal segments'
  )

export const teamFileSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  path: teamFilePathSchema,
  kind: teamFileKindSchema,
  currentVersion: versionSchema,
  currentVersionId: entityIdSchema,
  currentMimeType: z.string().min(1).max(160),
  currentAvailability: teamFileAvailabilitySchema,
  currentSha256: sha256Schema,
  currentSizeBytes: z.number().int().nonnegative().max(524_288),
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const teamFileVersionSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  teamFileId: entityIdSchema,
  version: versionSchema,
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().nonnegative().max(524_288),
  sha256: sha256Schema,
  availability: teamFileAvailabilitySchema,
  quarantineReason: z.string().max(500).nullable(),
  createdByUserId: entityIdSchema,
  createdAt: timestampSchema
})

export const teamFileVersionContentSchema = teamFileVersionSchema.extend({
  contentBase64: z.string().max(700_000)
})

export const teamFileContentInputSchema = z.object({
  mimeType: z.string().trim().min(1).max(160),
  contentBase64: z.string().max(700_000)
})

export const createTeamFileRequestSchema = teamFileContentInputSchema.extend({
  path: teamFilePathSchema,
  kind: teamFileKindSchema
})

export const createTeamFileVersionRequestSchema = teamFileContentInputSchema.extend({
  expectedCurrentVersion: versionSchema
})

export const teamFileProposalSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  projectId: entityIdSchema,
  teamFileId: entityIdSchema,
  baseVersion: versionSchema,
  teamAgentId: entityIdSchema,
  requestedByUserId: entityIdSchema,
  instructionsMarkdown: z.string().trim().min(1).max(8_000),
  proposedContentBase64: z.string().max(100_000).nullable(),
  status: teamFileProposalStatusSchema,
  errorCode: z.string().max(160).nullable(),
  appliedVersionId: entityIdSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const createTeamFileProposalRequestSchema = z.object({
  teamAgentId: entityIdSchema,
  instructionsMarkdown: z.string().trim().min(1).max(8_000)
})

export type TeamFile = z.infer<typeof teamFileSchema>
export type TeamFileVersion = z.infer<typeof teamFileVersionSchema>
export type TeamFileVersionContent = z.infer<typeof teamFileVersionContentSchema>
export type TeamFileProposal = z.infer<typeof teamFileProposalSchema>
export type CreateTeamFileRequest = z.infer<typeof createTeamFileRequestSchema>
export type CreateTeamFileVersionRequest = z.infer<typeof createTeamFileVersionRequestSchema>
export type CreateTeamFileProposalRequest = z.infer<typeof createTeamFileProposalRequestSchema>

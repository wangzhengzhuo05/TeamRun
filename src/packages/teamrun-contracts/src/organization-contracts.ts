import { z } from 'zod'
import { entityIdSchema, markdownSchema, timestampSchema } from './scalars.js'

function isGitRemoteUrl(value: string): boolean {
  if (/^[^\s@]+@[^\s:]+:[^\s]+$/.test(value)) {
    return true
  }
  try {
    const url = new URL(value)
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) {
      return false
    }
    if (url.password || (url.username && (url.protocol === 'https:' || url.protocol === 'http:'))) {
      return false
    }
    return Boolean(url.hostname && url.pathname && url.pathname !== '/')
  } catch {
    return false
  }
}

export const gitRemoteUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isGitRemoteUrl, 'Expected an HTTPS or SSH Git remote URL without credentials')

export const organizationRoleSchema = z.enum(['owner', 'admin', 'member'])

export const organizationMemberSchema = z.object({
  userId: entityIdSchema,
  email: z.email(),
  displayName: z.string().min(1).max(160),
  role: organizationRoleSchema,
  joinedAt: timestampSchema
})

export const organizationInvitationSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  email: z.email(),
  role: organizationRoleSchema.exclude(['owner']),
  status: z.enum(['pending', 'accepted', 'revoked']),
  invitedByUserId: entityIdSchema,
  expiresAt: timestampSchema,
  createdAt: timestampSchema
})

export const teamInviteCodeSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  codeHint: z.string().length(4),
  status: z.enum(['active', 'redeemed', 'revoked', 'expired']),
  createdByUserId: entityIdSchema,
  redeemedByUserId: entityIdSchema.nullable(),
  expiresAt: timestampSchema,
  redeemedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema
})

export const createdTeamInviteCodeSchema = teamInviteCodeSchema.extend({
  code: z.string().min(1)
})

export const organizationSchema = z.object({
  id: entityIdSchema,
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(160),
  role: organizationRoleSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const projectSchema = z.object({
  id: entityIdSchema,
  organizationId: entityIdSchema,
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  name: z.string().min(1).max(160),
  contextMarkdown: markdownSchema,
  contextVersion: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const repositorySchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  provider: z.enum(['github', 'gitlab', 'other']),
  remoteUrl: gitRemoteUrlSchema,
  displayName: z.string().min(1).max(240),
  defaultBranch: z.string().min(1).max(240),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const createProjectRequestSchema = projectSchema.pick({
  key: true,
  name: true,
  contextMarkdown: true
})

export const updateProjectRequestSchema = createProjectRequestSchema.partial()

export const createRepositoryRequestSchema = repositorySchema.pick({
  provider: true,
  remoteUrl: true,
  displayName: true,
  defaultBranch: true
})

export type Organization = z.infer<typeof organizationSchema>
export type OrganizationMember = z.infer<typeof organizationMemberSchema>
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>
export type TeamInviteCode = z.infer<typeof teamInviteCodeSchema>
export type CreatedTeamInviteCode = z.infer<typeof createdTeamInviteCodeSchema>
export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type Project = z.infer<typeof projectSchema>
export type Repository = z.infer<typeof repositorySchema>
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>
export type CreateRepositoryRequest = z.infer<typeof createRepositoryRequestSchema>

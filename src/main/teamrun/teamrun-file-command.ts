import { z } from 'zod'
import {
  createTeamFileProposalRequestSchema,
  createTeamFileRequestSchema,
  createTeamFileVersionRequestSchema
} from '../../packages/teamrun-contracts/src/index'
import type { TeamRunCloudOperation } from '../../shared/teamrun-cloud-operations'
import type { TeamRunApiClient } from './teamrun-api-client'

const idSchema = z.uuid()
export type TeamRunFileOperation = Extract<TeamRunCloudOperation, `files.${string}`>

export function invokeTeamRunFileOperation(
  client: TeamRunApiClient,
  operation: TeamRunFileOperation,
  args: unknown
): Promise<unknown> {
  switch (operation) {
    case 'files.list':
      return client.request(`/v1/projects/${idSchema.parse(args)}/files`)
    case 'files.create': {
      const parsed = z
        .object({ projectId: idSchema, file: createTeamFileRequestSchema })
        .parse(args)
      return client.request(`/v1/projects/${parsed.projectId}/files`, {
        method: 'POST',
        body: parsed.file,
        queueIfOffline: false
      })
    }
    case 'files.listVersions':
      return client.request(`/v1/files/${idSchema.parse(args)}/versions`, { cache: false })
    case 'files.readVersion':
      return client.request(`/v1/file-versions/${idSchema.parse(args)}`, { cache: false })
    case 'files.createVersion': {
      const parsed = z
        .object({ teamFileId: idSchema, version: createTeamFileVersionRequestSchema })
        .parse(args)
      return client.request(`/v1/files/${parsed.teamFileId}/versions`, {
        method: 'POST',
        body: parsed.version,
        queueIfOffline: false
      })
    }
    case 'files.listProposals':
      return client.request(`/v1/files/${idSchema.parse(args)}/proposals`, { cache: false })
    case 'files.requestProposal': {
      const parsed = z
        .object({ teamFileId: idSchema, proposal: createTeamFileProposalRequestSchema })
        .parse(args)
      return client.request(`/v1/files/${parsed.teamFileId}/proposals`, {
        method: 'POST',
        body: parsed.proposal,
        queueIfOffline: false,
        timeoutMs: 135_000
      })
    }
    case 'files.applyProposal':
      return client.request(`/v1/file-proposals/${idSchema.parse(args)}/apply`, {
        method: 'POST',
        body: {},
        queueIfOffline: false
      })
    case 'files.clearQuarantine':
      return client.request(`/v1/file-versions/${idSchema.parse(args)}/clear-quarantine`, {
        method: 'POST',
        body: {},
        queueIfOffline: false
      })
    case 'files.delete':
      return client.request(`/v1/files/${idSchema.parse(args)}`, {
        method: 'DELETE',
        cache: false
      })
  }
}

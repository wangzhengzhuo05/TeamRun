import { and, eq } from 'drizzle-orm'
import type { OrganizationRole } from '@teamrun/contracts'
import type { TeamRunDatabase } from '../database/connection.js'
import { organizationMembers } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export async function requireOrganizationRole(
  db: TeamRunDatabase,
  organizationId: string,
  userId: string,
  roles?: readonly OrganizationRole[]
): Promise<OrganizationRole> {
  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1)
  if (!membership) {
    throw new ApiProblem(404, 'organization_not_found', 'Organization was not found')
  }
  if (roles && !roles.includes(membership.role)) {
    throw new ApiProblem(403, 'insufficient_role', 'Organization role does not permit this action')
  }
  return membership.role
}

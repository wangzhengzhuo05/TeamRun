import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { projects } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export async function requireProject(app: FastifyInstance, projectId: string, userId: string) {
  const [project] = await app.teamRunDatabase
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!project) throw new ApiProblem(404, 'project_not_found', 'Project was not found')
  await requireOrganizationRole(app.teamRunDatabase, project.organizationId, userId)
  return project
}

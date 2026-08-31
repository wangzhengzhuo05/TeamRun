import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireOrganizationRole } from '../auth/organization-access.js'
import { tasks } from '../database/schema.js'
import { ApiProblem } from '../http/api-problem.js'

export async function requireTask(app: FastifyInstance, taskId: string, userId: string) {
  const [task] = await app.teamRunDatabase.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) {
    throw new ApiProblem(404, 'task_not_found', 'Task was not found')
  }
  const role = await requireOrganizationRole(app.teamRunDatabase, task.organizationId, userId)
  return { task, role }
}

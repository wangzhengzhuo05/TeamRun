import { createHash } from 'node:crypto'
import type { ExternalTaskSource, TaskComment } from '@teamrun/contracts'

type ContextTask = {
  number: number
  title: string
  descriptionMarkdown: string
  status: string
  externalSource: ExternalTaskSource | null
}

export type TaskContextInput = {
  projectKey: string
  projectName: string
  projectContextMarkdown: string | null
  task: ContextTask
  comments: TaskComment[]
  includeExternalSource: boolean
}

function section(title: string, content: string): string {
  return `## ${title}\n\n${content.trim() || '_None_'}\n`
}

export function renderTaskContext(input: TaskContextInput): { markdown: string; hash: string } {
  const comments = [...input.comments]
    .sort((left, right) => {
      const timestampOrder = left.createdAt.localeCompare(right.createdAt)
      return timestampOrder || left.id.localeCompare(right.id)
    })
    .map(
      (comment) =>
        `### Comment ${comment.id} (${comment.createdAt})\n\n${comment.bodyMarkdown.trim()}`
    )
    .join('\n\n')
  const external =
    input.includeExternalSource && input.task.externalSource
      ? [
          `Provider: ${input.task.externalSource.provider}`,
          `External ID: ${input.task.externalSource.externalId}`,
          `Source URL: ${input.task.externalSource.url}`,
          `Imported at: ${input.task.externalSource.importedAt}`,
          '',
          input.task.externalSource.importedMarkdown
        ].join('\n')
      : ''
  const markdown = [
    '# TeamRun Task Context',
    '',
    `Project: ${input.projectKey} — ${input.projectName}`,
    `Task: ${input.projectKey}-${input.task.number}`,
    `Status: ${input.task.status}`,
    '',
    section('Task title', input.task.title),
    section('Task description', input.task.descriptionMarkdown),
    ...(input.projectContextMarkdown === null
      ? []
      : [section('Project context', input.projectContextMarkdown)]),
    ...(input.includeExternalSource && input.task.externalSource
      ? [section('Imported source snapshot', external)]
      : []),
    section('Team discussion', comments)
  ].join('\n')
  return {
    markdown,
    hash: createHash('sha256').update(markdown, 'utf8').digest('hex')
  }
}

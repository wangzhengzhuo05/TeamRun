import { describe, expect, it } from 'vitest'
import { renderTaskContext } from './task-context-renderer.js'

const baseInput = {
  projectKey: 'TEAM',
  projectName: 'TeamRun',
  projectContextMarkdown: 'Use the repository instructions.',
  task: {
    number: 4,
    title: 'Deterministic context',
    descriptionMarkdown: 'Render the same bytes.',
    status: 'in_progress',
    externalSource: null
  },
  comments: [],
  includeExternalSource: true
}

describe('renderTaskContext', () => {
  it('produces stable markdown and hashes', () => {
    expect(renderTaskContext(baseInput)).toEqual(renderTaskContext(baseInput))
  })

  it('sorts comments by timestamp then id', () => {
    const comments = [
      {
        id: '00000000-0000-4000-8000-000000000002',
        organizationId: '00000000-0000-4000-8000-000000000001',
        taskId: '00000000-0000-4000-8000-000000000003',
        authorUserId: '00000000-0000-4000-8000-000000000004',
        bodyMarkdown: 'Second',
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z'
      },
      {
        id: '00000000-0000-4000-8000-000000000001',
        organizationId: '00000000-0000-4000-8000-000000000001',
        taskId: '00000000-0000-4000-8000-000000000003',
        authorUserId: '00000000-0000-4000-8000-000000000004',
        bodyMarkdown: 'First',
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z'
      }
    ]
    const rendered = renderTaskContext({ ...baseInput, comments })
    expect(rendered.markdown.indexOf('First')).toBeLessThan(rendered.markdown.indexOf('Second'))
  })
})

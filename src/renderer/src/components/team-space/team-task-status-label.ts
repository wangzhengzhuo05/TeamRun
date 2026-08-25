import type { TaskStatus } from '../../../../shared/teamrun-api'
import { translate } from '@/i18n/i18n'

export function teamTaskStatusLabel(status: TaskStatus): string {
  if (status === 'todo') return translate('teamRun.taskStatus.todo', 'To do')
  if (status === 'in_progress') {
    return translate('teamRun.taskStatus.inProgress', 'In progress')
  }
  if (status === 'in_review') return translate('teamRun.taskStatus.inReview', 'In review')
  if (status === 'done') return translate('teamRun.taskStatus.done', 'Done')
  return translate('teamRun.taskStatus.canceled', 'Canceled')
}

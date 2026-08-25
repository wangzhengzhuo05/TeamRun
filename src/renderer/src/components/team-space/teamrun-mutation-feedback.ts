import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

const QUEUED_MESSAGES = ['Saved offline.', 'Saved for later.']

export function isTeamRunMutationQueued(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === 'teamrun_mutation_queued') return true
  const message = candidate.message
  return typeof message === 'string' && QUEUED_MESSAGES.some((prefix) => message.includes(prefix))
}

export function reportTeamRunMutation(error: unknown, fallback: string): boolean {
  const message = error instanceof Error ? error.message : fallback
  if (isTeamRunMutationQueued(error)) {
    toast.info(
      translate(
        'auto.components.team.space.teamrunMutationFeedback.queued',
        'Saved locally and queued for sync.'
      )
    )
    return true
  }
  toast.error(message)
  return false
}

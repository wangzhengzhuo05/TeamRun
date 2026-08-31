import { translate } from '@/i18n/i18n'

const FILE_ERROR_IDS = [
  ['team_file_too_large', 'tooLarge'],
  ['team_file_path_conflict', 'pathConflict'],
  ['team_file_content_invalid', 'contentInvalid'],
  ['team_file_quarantined', 'quarantined'],
  ['team_file_context_unsupported', 'contextUnsupported'],
  ['team_document_agent_input_too_large', 'agentInputTooLarge'],
  ['team_file_proposal_stale', 'proposalStale'],
  ['team_file_proposal_not_ready', 'proposalNotReady']
] as const

type FileErrorId = (typeof FILE_ERROR_IDS)[number][1]

export function teamRunFileErrorMessage(signal: string): string | null {
  const match = FILE_ERROR_IDS.find(([code]) => signal.includes(code))
  return match ? localizedFileError(match[1]) : null
}

function localizedFileError(id: FileErrorId): string {
  switch (id) {
    case 'tooLarge':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileTooLarge',
        'Each Team File version is limited to 512 KiB.'
      )
    case 'pathConflict':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFilePathConflict',
        'A Team File already uses this path.'
      )
    case 'contentInvalid':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileContentInvalid',
        'The Team File content could not be read.'
      )
    case 'quarantined':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileQuarantined',
        'An Owner must clear this Team File version before it can be used.'
      )
    case 'contextUnsupported':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileContextUnsupported',
        'Only text Team Files can be added to task context.'
      )
    case 'agentInputTooLarge':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamDocumentAgentInputTooLarge',
        'This document is too large for a Team Agent edit.'
      )
    case 'proposalStale':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileProposalStale',
        'The document changed after this proposal. Generate a new proposal.'
      )
    case 'proposalNotReady':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamFileProposalNotReady',
        'This document proposal is not ready to apply.'
      )
  }
}

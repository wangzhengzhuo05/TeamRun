import { translate } from '@/i18n/i18n'
import { teamRunFileErrorMessage } from './teamrun-file-error-message'

type ErrorCopy = {
  signals: string[]
  id:
    | 'httpsRequired'
    | 'teamKeyRequired'
    | 'developmentEmailRequired'
    | 'authenticationFailed'
    | 'sessionExpired'
    | 'singleSignOnUnavailable'
    | 'serviceUnconfigured'
    | 'accessDenied'
    | 'versionConflict'
    | 'memberNotSignedIn'
    | 'inviteCodeInvalid'
    | 'inviteCodeUsed'
    | 'inviteCodeUnavailable'
    | 'alreadyTeamMember'
    | 'ownerChangeForbidden'
    | 'teamServerUnavailable'
    | 'teamServerRequired'
    | 'teamServerOpenCodeMissing'
    | 'teamServerEncryptionUnavailable'
    | 'teamServerDocumentEditUpdateRequired'
    | 'teamServerDevelopmentUpdateRequired'
    | 'teamServerDevelopmentRequiresYolo'
    | 'teamProjectRepositoryRequired'
    | 'teamProjectRepositoryLimit'
    | 'teamAgentMigrationRequired'
}

const ERROR_COPY: ErrorCopy[] = [
  {
    signals: ['teamrun_https_required'],
    id: 'httpsRequired'
  },
  {
    signals: ['teamrun_shared_key_required'],
    id: 'teamKeyRequired'
  },
  {
    signals: ['teamrun_dev_email_required', 'invalid_dev_identity'],
    id: 'developmentEmailRequired'
  },
  {
    signals: [
      'invalid_shared_key',
      'authentication_required',
      'teamrun_authentication_required',
      'teamrun_auth_http_401'
    ],
    id: 'authenticationFailed'
  },
  {
    signals: ['teamrun_session_expired'],
    id: 'sessionExpired'
  },
  {
    signals: ['teamrun_oidc_not_configured', 'teamrun_oidc_issuer_mismatch'],
    id: 'singleSignOnUnavailable'
  },
  {
    signals: ['teamrun_api_unconfigured'],
    id: 'serviceUnconfigured'
  },
  {
    signals: ['teamrun_auth_http_403', 'forbidden', 'insufficient_role'],
    id: 'accessDenied'
  },
  {
    signals: ['version_conflict'],
    id: 'versionConflict'
  },
  {
    signals: ['member_has_not_signed_in'],
    id: 'memberNotSignedIn'
  },
  {
    signals: ['invite_code_invalid'],
    id: 'inviteCodeInvalid'
  },
  {
    signals: ['invite_code_redeemed'],
    id: 'inviteCodeUsed'
  },
  {
    signals: ['invite_code_revoked', 'invite_code_expired'],
    id: 'inviteCodeUnavailable'
  },
  {
    signals: ['already_team_member'],
    id: 'alreadyTeamMember'
  },
  {
    signals: ['owner_change_forbidden'],
    id: 'ownerChangeForbidden'
  },
  {
    signals: ['team_server_unavailable', 'team_server_timeout'],
    id: 'teamServerUnavailable'
  },
  {
    signals: ['team_server_required'],
    id: 'teamServerRequired'
  },
  {
    signals: ['team_server_opencode_missing'],
    id: 'teamServerOpenCodeMissing'
  },
  {
    signals: ['team_server_model_encryption_unavailable', 'team_server_encryption_unavailable'],
    id: 'teamServerEncryptionUnavailable'
  },
  {
    signals: ['team_server_document_edit_update_required'],
    id: 'teamServerDocumentEditUpdateRequired'
  },
  {
    signals: ['team_server_development_run_update_required'],
    id: 'teamServerDevelopmentUpdateRequired'
  },
  {
    signals: ['team_server_development_run_requires_yolo'],
    id: 'teamServerDevelopmentRequiresYolo'
  },
  {
    signals: ['team_project_repository_required'],
    id: 'teamProjectRepositoryRequired'
  },
  {
    signals: ['team_project_repository_limit'],
    id: 'teamProjectRepositoryLimit'
  },
  {
    signals: ['team_agent_server_migration_required'],
    id: 'teamAgentMigrationRequired'
  }
]

function errorSignal(error: unknown): string {
  if (typeof error === 'string') {
    return error.toLowerCase()
  }
  if (!error || typeof error !== 'object') {
    return ''
  }
  const candidate = error as { code?: unknown; message?: unknown }
  return [candidate.code, candidate.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

export function teamRunErrorMessage(error: unknown, fallback: string): string {
  const signal = errorSignal(error)
  const fileMessage = teamRunFileErrorMessage(signal)
  if (fileMessage) {
    return fileMessage
  }
  const copy = ERROR_COPY.find((entry) => entry.signals.some((value) => signal.includes(value)))
  return copy ? localizedErrorMessage(copy.id) : fallback
}

function localizedErrorMessage(id: ErrorCopy['id']): string {
  switch (id) {
    case 'httpsRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.httpsRequired',
        'Use HTTPS for remote TeamRun services.'
      )
    case 'teamKeyRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamKeyRequired',
        'Enter a valid team key.'
      )
    case 'developmentEmailRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.developmentEmailRequired',
        'Enter a valid development email.'
      )
    case 'authenticationFailed':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.authenticationFailed',
        'TeamRun could not verify these credentials.'
      )
    case 'sessionExpired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.sessionExpired',
        'Your TeamRun session expired. Sign in again.'
      )
    case 'singleSignOnUnavailable':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.singleSignOnUnavailable',
        'Single sign-on is not configured correctly.'
      )
    case 'serviceUnconfigured':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.serviceUnconfigured',
        'Set the TeamRun service address before continuing.'
      )
    case 'accessDenied':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.accessDenied',
        'You do not have permission to perform this action.'
      )
    case 'versionConflict':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.versionConflict',
        'This item changed on the server. Refresh and try again.'
      )
    case 'memberNotSignedIn':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.memberNotSignedIn',
        'This member must sign in to TeamRun before being added.'
      )
    case 'inviteCodeInvalid':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.inviteCodeInvalid',
        'This invite code is invalid.'
      )
    case 'inviteCodeUsed':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.inviteCodeUsed',
        'This invite code has already been used.'
      )
    case 'inviteCodeUnavailable':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.inviteCodeUnavailable',
        'This invite code has expired or was revoked.'
      )
    case 'alreadyTeamMember':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.alreadyTeamMember',
        'You are already a member of this Team.'
      )
    case 'ownerChangeForbidden':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.ownerChangeForbidden',
        'The Team Owner role cannot be changed or removed.'
      )
    case 'teamServerUnavailable':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerUnavailable',
        'Team Server is unavailable. Check its connection and try again.'
      )
    case 'teamServerRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerRequired',
        'Bind a Team Server before continuing.'
      )
    case 'teamServerOpenCodeMissing':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerOpenCodeMissing',
        'Install OpenCode on the Team Server before binding it.'
      )
    case 'teamServerEncryptionUnavailable':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerEncryptionUnavailable',
        'Configure encrypted model credential storage on the Team Server.'
      )
    case 'teamServerDocumentEditUpdateRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerDocumentEditUpdateRequired',
        'Update the Team Server before requesting document edits.'
      )
    case 'teamServerDevelopmentUpdateRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerDevelopmentUpdateRequired',
        'Update the Team Server before starting development runs.'
      )
    case 'teamServerDevelopmentRequiresYolo':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamServerDevelopmentRequiresYolo',
        'Enable YOLO mode for this Team Agent before starting development work.'
      )
    case 'teamProjectRepositoryRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamProjectRepositoryRequired',
        'Bind a repository to this Team Project before starting development work.'
      )
    case 'teamProjectRepositoryLimit':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamProjectRepositoryLimit',
        'This release supports one repository per Team Project.'
      )
    case 'teamAgentMigrationRequired':
      return translate(
        'auto.components.team.space.teamrunErrorMessage.teamAgentMigrationRequired',
        'Recreate this Team Agent with a Team Server Model Connection.'
      )
  }
}

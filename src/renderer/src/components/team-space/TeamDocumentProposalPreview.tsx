import type {
  OrganizationMember,
  TeamAgent,
  TeamFileProposal
} from '../../../../shared/teamrun-api'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { base64ToText } from './team-file-content'

type Props = {
  agents: TeamAgent[]
  members: OrganizationMember[]
  proposals: TeamFileProposal[]
  selectedProposalId: string
  onSelect: (proposalId: string) => void
}

export function TeamDocumentProposalPreview(props: Props) {
  const proposal = props.proposals.find((entry) => entry.id === props.selectedProposalId) ?? null
  if (!proposal) {
    return null
  }
  const proposedMarkdown = proposal.proposedContentBase64
    ? base64ToText(proposal.proposedContentBase64)
    : null

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-2">
        <Label htmlFor="document-proposal-history">
          {translate(
            'auto.components.team.space.TeamDocumentAgentDialog.history',
            'Team proposals'
          )}
        </Label>
        <Select value={proposal.id} onValueChange={props.onSelect}>
          <SelectTrigger id="document-proposal-history">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.proposals.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {proposalLabel(entry, props.agents, props.members)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="document-proposal-request">
          {translate(
            'auto.components.team.space.TeamDocumentAgentDialog.instructions',
            'Requested change'
          )}
        </Label>
        <Textarea id="document-proposal-request" value={proposal.instructionsMarkdown} readOnly />
      </div>
      {proposedMarkdown !== null ? (
        <div className="space-y-2">
          <Label htmlFor="document-proposal-preview">
            {translate(
              'auto.components.team.space.TeamDocumentAgentDialog.preview',
              'Proposed complete document'
            )}
          </Label>
          <Textarea
            id="document-proposal-preview"
            className="max-h-80 min-h-48 font-mono"
            value={proposedMarkdown}
            readOnly
          />
        </div>
      ) : null}
    </div>
  )
}

function proposalLabel(
  proposal: TeamFileProposal,
  agents: TeamAgent[],
  members: OrganizationMember[]
): string {
  const agent = agents.find((entry) => entry.id === proposal.teamAgentId)?.name ?? unknownAgent()
  const member =
    members.find((entry) => entry.userId === proposal.requestedByUserId)?.displayName ??
    unknownMember()
  return `v${proposal.baseVersion} · ${agent} · ${member} · ${statusLabel(proposal.status)}`
}

function statusLabel(status: TeamFileProposal['status']): string {
  const labels = {
    running: ['statusRunning', 'Running'],
    ready: ['statusReady', 'Ready'],
    applied: ['statusApplied', 'Applied'],
    failed: ['statusFailed', 'Failed']
  } as const
  const [key, fallback] = labels[status]
  return translate(`auto.components.team.space.TeamDocumentAgentDialog.${key}`, fallback)
}

function unknownAgent(): string {
  return translate(
    'auto.components.team.space.TeamDocumentAgentDialog.unknownAgent',
    'Unknown Agent'
  )
}

function unknownMember(): string {
  return translate(
    'auto.components.team.space.TeamDocumentAgentDialog.unknownMember',
    'Unknown member'
  )
}

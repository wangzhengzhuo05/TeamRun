import { useEffect, useState } from 'react'
import { Bot, Loader2, Sparkles } from 'lucide-react'
import type {
  OrganizationMember,
  TeamAgent,
  TeamFile,
  TeamFileProposal
} from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
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
import { reportTeamRunMutation } from './teamrun-mutation-feedback'
import { TeamDocumentProposalPreview } from './TeamDocumentProposalPreview'

type Props = {
  authUserId: string | null
  file: TeamFile
  onApplied: () => Promise<void>
}

export function TeamDocumentAgentDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [agentId, setAgentId] = useState('')
  const [instructions, setInstructions] = useState('')
  const [proposals, setProposals] = useState<TeamFileProposal[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setAgents([])
    setMembers([])
    setProposals([])
    setSelectedProposalId('')
    setLoading(true)
    void Promise.all([
      window.api.teamRun.collaboration.listTeamAgents(props.file.projectId),
      window.api.teamRun.organizations.listMembers(props.file.organizationId),
      window.api.teamRun.files.listProposals(props.file.id)
    ])
      .then(([nextAgents, nextMembers, nextProposals]) => {
        if (!active) {
          return
        }
        const eligible = nextAgents.filter(
          (agent) => agent.agentKind === 'opencode' && Boolean(agent.modelConnectionId)
        )
        setAgents(eligible)
        setMembers(nextMembers)
        setAgentId((current) =>
          current && eligible.some((agent) => agent.id === current)
            ? current
            : (eligible[0]?.id ?? '')
        )
        setProposals(nextProposals)
        setSelectedProposalId(
          nextProposals.find(
            (entry) =>
              entry.baseVersion === props.file.currentVersion &&
              entry.requestedByUserId === props.authUserId &&
              (entry.status === 'ready' || entry.status === 'applied')
          )?.id ??
            nextProposals[0]?.id ??
            ''
        )
      })
      .catch((error) => reportTeamRunMutation(error, loadError()))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [
    open,
    props.authUserId,
    props.file.currentVersion,
    props.file.id,
    props.file.organizationId,
    props.file.projectId
  ])

  const requestProposal = async () => {
    if (!agentId || !instructions.trim()) {
      return
    }
    setLoading(true)
    try {
      const next = await window.api.teamRun.files.requestProposal({
        teamFileId: props.file.id,
        proposal: { teamAgentId: agentId, instructionsMarkdown: instructions.trim() }
      })
      setProposals((current) => [next, ...current.filter((entry) => entry.id !== next.id)])
      setSelectedProposalId(next.id)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamDocumentAgentDialog.requestError',
          'Unable to create document proposal'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const applyProposal = async () => {
    const proposal = proposals.find((entry) => entry.id === selectedProposalId)
    if (!proposal || proposal.status !== 'ready') {
      return
    }
    setLoading(true)
    try {
      await window.api.teamRun.files.applyProposal(proposal.id)
      await props.onApplied()
      setOpen(false)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamDocumentAgentDialog.applyError',
          'Unable to apply document proposal'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const proposal = proposals.find((entry) => entry.id === selectedProposalId) ?? null
  const canApply =
    proposal?.status === 'ready' &&
    proposal.baseVersion === props.file.currentVersion &&
    proposal.requestedByUserId === props.authUserId

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles />
          {translate(
            'auto.components.team.space.TeamDocumentAgentDialog.trigger',
            'Ask Team Agent'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamDocumentAgentDialog.title',
              'Propose a document edit'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.TeamDocumentAgentDialog.description',
              'The Team Agent cannot overwrite the document. Review and confirm its complete replacement first.'
            )}
          </DialogDescription>
        </DialogHeader>
        {loading && agents.length === 0 && proposals.length === 0 ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate(
                  'auto.components.team.space.TeamDocumentAgentDialog.noAgents',
                  'Create a Team Server Agent before requesting document edits.'
                )}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="document-proposal-agent">
                    {translate(
                      'auto.components.team.space.TeamDocumentAgentDialog.agent',
                      'Team Agent'
                    )}
                  </Label>
                  <Select value={agentId} onValueChange={setAgentId} disabled={loading}>
                    <SelectTrigger id="document-proposal-agent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document-proposal-instructions">
                    {translate(
                      'auto.components.team.space.TeamDocumentAgentDialog.instructions',
                      'Requested change'
                    )}
                  </Label>
                  <Textarea
                    id="document-proposal-instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    disabled={loading}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void requestProposal()}
                  disabled={loading || !agentId || !instructions.trim()}
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Bot />}
                  {translate(
                    'auto.components.team.space.TeamDocumentAgentDialog.generate',
                    'Generate proposal'
                  )}
                </Button>
              </div>
            )}
            <TeamDocumentProposalPreview
              agents={agents}
              members={members}
              proposals={proposals}
              selectedProposalId={selectedProposalId}
              onSelect={setSelectedProposalId}
            />
            {proposal?.status === 'ready' && proposal.requestedByUserId !== props.authUserId ? (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.team.space.TeamDocumentAgentDialog.requesterOnly',
                  'Only the member who requested this proposal can confirm it.'
                )}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => void applyProposal()} disabled={loading || !canApply}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {translate(
              'auto.components.team.space.TeamDocumentAgentDialog.apply',
              'Confirm and create version'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function loadError(): string {
  return translate(
    'auto.components.team.space.TeamDocumentAgentDialog.loadError',
    'Unable to load document proposals'
  )
}

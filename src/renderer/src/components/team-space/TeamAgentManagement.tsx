import { useEffect, useMemo, useState } from 'react'
import { Bot, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { TeamAgent } from '../../../../shared/teamrun-api'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type Props = {
  projectId: string | null
  active: boolean
}

export function TeamAgentManagement({ projectId, active }: Props) {
  const catalog = useMemo(() => getAgentCatalog(), [])
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([])
  const [agentName, setAgentName] = useState('')
  const [agentKind, setAgentKind] = useState<string>(catalog[0]?.id ?? 'codex')
  const [launchCommand, setLaunchCommand] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instructions, setInstructions] = useState('')
  const [credentialInputs, setCredentialInputs] = useState<Record<string, string>>({})
  const [savingCredentialId, setSavingCredentialId] = useState<string | null>(null)
  const [configuredAgentIds, setConfiguredAgentIds] = useState<string[]>([])

  useEffect(() => {
    if (!active || !projectId) {
      return
    }
    void window.api.teamRun.collaboration
      .listTeamAgents(projectId)
      .then(async (agents) => {
        const statuses = await Promise.all(
          agents
            .filter((agent) => agent.agentKind === 'codex')
            .map(async (agent) => ({
              agentId: agent.id,
              ...(await window.api.teamRun.collaboration.credentialStatus(agent.id))
            }))
        )
        setTeamAgents(agents)
        setConfiguredAgentIds(
          statuses.filter((status) => status.configured).map((status) => status.agentId)
        )
      })
      .catch(reportError)
  }, [active, projectId])

  const createTeamAgent = async () => {
    if (!projectId || !agentName.trim()) {
      return
    }
    try {
      const created = await window.api.teamRun.collaboration.createTeamAgent({
        projectId,
        teamAgent: {
          name: agentName.trim(),
          agentKind,
          launchCommand: agentKind === 'generic-cli' ? launchCommand.trim() : null,
          instructionsMarkdown: instructions.trim()
        }
      })
      if (agentKind === 'codex') {
        await window.api.teamRun.collaboration.saveCredential({
          agentId: created.id,
          apiKey: apiKey.trim()
        })
        setConfiguredAgentIds((current) => [...current, created.id])
      }
      setTeamAgents((current) => [...current, created])
      setAgentName('')
      setLaunchCommand('')
      setApiKey('')
      setInstructions('')
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentManagement.createAgentError',
          'Unable to create Team Agent'
        )
      )
    }
  }

  const saveCredential = async (agentId: string) => {
    const value = credentialInputs[agentId]?.trim() ?? ''
    if (value.length < 24) {
      return
    }
    setSavingCredentialId(agentId)
    try {
      await window.api.teamRun.collaboration.saveCredential({ agentId, apiKey: value })
      setCredentialInputs((current) => ({ ...current, [agentId]: '' }))
      setConfiguredAgentIds((current) => [...new Set([...current, agentId])])
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentManagement.saveCredentialError',
          'Unable to save API key'
        )
      )
    } finally {
      setSavingCredentialId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-2">
        <Input
          value={agentName}
          onChange={(event) => setAgentName(event.target.value)}
          placeholder={translate(
            'auto.components.team.space.TeamAgentManagement.name',
            'Team Agent name'
          )}
        />
        <Select value={agentKind} onValueChange={setAgentKind}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
            <SelectItem value="generic-cli">
              {translate(
                'auto.components.team.space.TeamAgentManagement.genericCli',
                'Generic CLI'
              )}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {agentKind === 'generic-cli' ? (
        <div className="space-y-2">
          <Input
            value={launchCommand}
            onChange={(event) => setLaunchCommand(event.target.value)}
            placeholder={translate(
              'auto.components.team.space.TeamAgentManagement.launchCommand',
              'Command that accepts task context as its final argument'
            )}
          />
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentManagement.launchCommandHint',
              'The command is shared with project members. Keep credentials in the host environment.'
            )}
          </p>
        </div>
      ) : null}
      {agentKind === 'codex' ? (
        <div className="space-y-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={translate(
              'auto.components.team.space.TeamAgentManagement.apiKey',
              'OpenAI API key for chat replies'
            )}
          />
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentManagement.apiKeyHint',
              'Stored only on this runtime with operating-system credential protection.'
            )}
          </p>
        </div>
      ) : null}
      <Textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder={translate(
          'auto.components.team.space.TeamAgentManagement.instructions',
          'Reusable instructions added before the frozen task context'
        )}
      />
      <Button
        onClick={createTeamAgent}
        disabled={
          !agentName.trim() ||
          (agentKind === 'generic-cli' && !launchCommand.trim()) ||
          (agentKind === 'codex' && apiKey.trim().length < 24)
        }
      >
        <Plus />{' '}
        {translate('auto.components.team.space.TeamAgentManagement.create', 'Create Team Agent')}
      </Button>
      <div className="scrollbar-sleek max-h-56 space-y-2 overflow-y-auto">
        {teamAgents.map((agent) => (
          <div key={agent.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{agent.name}</span>
              <span className="text-xs text-muted-foreground">{agent.agentKind}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {agent.instructionsMarkdown ||
                translate(
                  'auto.components.team.space.TeamAgentManagement.noInstructions',
                  'No additional instructions'
                )}
            </p>
            {agent.agentKind === 'codex' ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {configuredAgentIds.includes(agent.id)
                    ? translate(
                        'auto.components.team.space.TeamAgentManagement.keyConfigured',
                        'Local API key configured'
                      )
                    : translate(
                        'auto.components.team.space.TeamAgentManagement.keyMissing',
                        'Local API key required for chat replies'
                      )}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={credentialInputs[agent.id] ?? ''}
                    onChange={(event) =>
                      setCredentialInputs((current) => ({
                        ...current,
                        [agent.id]: event.target.value
                      }))
                    }
                    placeholder={translate(
                      'auto.components.team.space.TeamAgentManagement.updateKey',
                      'Set or replace local API key'
                    )}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void saveCredential(agent.id)}
                    disabled={
                      savingCredentialId === agent.id ||
                      (credentialInputs[agent.id]?.trim().length ?? 0) < 24
                    }
                  >
                    <Bot />
                    {savingCredentialId === agent.id
                      ? translate(
                          'auto.components.team.space.TeamAgentManagement.saving',
                          'Saving…'
                        )
                      : translate(
                          'auto.components.team.space.TeamAgentManagement.saveKey',
                          'Save key'
                        )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function reportError(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.team.space.TeamAgentManagement.loadError',
          'Unable to load Team Agents'
        )
  )
}

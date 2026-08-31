import { useEffect, useState } from 'react'
import { Bot, Loader2, Plus } from 'lucide-react'
import type { ModelConnection, TeamAgent } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  projectId: string | null
  connections: ModelConnection[]
  teamAgents: TeamAgent[]
  canManage: boolean
  onCreated: (agent: TeamAgent) => void
}

export function TeamAgentDefinitionSection(props: Props) {
  const [name, setName] = useState('')
  const [connectionId, setConnectionId] = useState(props.connections[0]?.id ?? '')
  const [instructions, setInstructions] = useState('')
  const [yoloMode, setYoloMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!connectionId && props.connections[0]) {
      setConnectionId(props.connections[0].id)
    }
  }, [connectionId, props.connections])

  const create = async () => {
    if (!props.projectId || !name.trim() || !connectionId) {
      return
    }
    setSubmitting(true)
    try {
      const agent = await window.api.teamRun.collaboration.createTeamAgent({
        projectId: props.projectId,
        teamAgent: {
          name: name.trim(),
          agentKind: 'opencode',
          launchCommand: null,
          modelConnectionId: connectionId,
          yoloMode,
          instructionsMarkdown: instructions.trim()
        }
      })
      props.onCreated(agent)
      setName('')
      setInstructions('')
      setYoloMode(false)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentManagement.createAgentError',
          'Unable to create Team Agent'
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4" />
          {translate('auto.components.team.space.TeamAgentManagement.teamAgents', 'Team Agents')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.teamAgentDescription',
            'Reusable identities run with one frozen Team context on the bound Team Server.'
          )}
        </p>
      </div>

      <div className="space-y-2">
        {props.teamAgents.map((agent) => {
          const connection = props.connections.find((entry) => entry.id === agent.modelConnectionId)
          return (
            <div key={agent.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{agent.name}</span>
                <span className="text-xs text-muted-foreground">
                  {connection?.name ??
                    translate(
                      'auto.components.team.space.TeamAgentManagement.migrationRequired',
                      'Migration required'
                    )}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {agent.instructionsMarkdown ||
                  translate(
                    'auto.components.team.space.TeamAgentManagement.noInstructions',
                    'No additional instructions'
                  )}
              </p>
              {agent.yoloMode ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TeamAgentManagement.yoloEnabled',
                    'YOLO mode enabled for development runs'
                  )}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {props.canManage && props.connections.length > 0 ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="team-agent-name">
                {translate(
                  'auto.components.team.space.TeamAgentManagement.name',
                  'Team Agent name'
                )}
              </Label>
              <Input
                id="team-agent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-agent-model-connection">
                {translate(
                  'auto.components.team.space.TeamAgentManagement.modelConnection',
                  'Model Connection'
                )}
              </Label>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger id="team-agent-model-connection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} · {connection.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-agent-instructions">
              {translate(
                'auto.components.team.space.TeamAgentManagement.instructions',
                'Reusable instructions'
              )}
            </Label>
            <Textarea
              id="team-agent-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md bg-muted p-3">
            <div className="space-y-1">
              <Label htmlFor="team-agent-yolo-mode">
                {translate('auto.components.team.space.TeamAgentManagement.yoloMode', 'YOLO mode')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.team.space.TeamAgentManagement.yoloDescription',
                  'Future development runs may add files without asking. All Team activity remains visible.'
                )}
              </p>
            </div>
            <Switch id="team-agent-yolo-mode" checked={yoloMode} onCheckedChange={setYoloMode} />
          </div>
          <Button
            onClick={() => void create()}
            disabled={submitting || !name.trim() || !connectionId}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
            {submitting
              ? translate(
                  'auto.components.team.space.TeamAgentManagement.creatingAgent',
                  'Creating Team Agent…'
                )
              : translate(
                  'auto.components.team.space.TeamAgentManagement.create',
                  'Create Team Agent'
                )}
          </Button>
        </div>
      ) : null}
      {props.canManage && props.connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.connectionFirst',
            'Create a Model Connection before creating a Team Agent.'
          )}
        </p>
      ) : null}
      {!props.canManage ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.ownerOnly',
            'Only the Team Owner can create or configure Team Agents.'
          )}
        </p>
      ) : null}
    </section>
  )
}

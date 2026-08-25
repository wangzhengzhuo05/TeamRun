import { useEffect, useMemo, useState } from 'react'
import { Bot, MessagesSquare, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { Channel, ChannelMessage, TeamAgent } from '../../../../shared/teamrun-api'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

export function TeamCollaborationDialog({ projectId }: { projectId: string | null }) {
  const catalog = useMemo(() => getAgentCatalog(), [])
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState('')
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([])
  const [channelName, setChannelName] = useState('')
  const [message, setMessage] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentKind, setAgentKind] = useState<string>(catalog[0]?.id ?? 'codex')
  const [launchCommand, setLaunchCommand] = useState('')
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    if (!open || !projectId) return
    void Promise.all([
      window.api.teamRun.collaboration.listChannels(projectId),
      window.api.teamRun.collaboration.listTeamAgents(projectId)
    ])
      .then(([nextChannels, nextAgents]) => {
        setChannels(nextChannels)
        setChannelId((current) =>
          current && nextChannels.some((channel) => channel.id === current)
            ? current
            : (nextChannels[0]?.id ?? '')
        )
        setTeamAgents(nextAgents)
      })
      .catch(reportError)
  }, [open, projectId])

  useEffect(() => {
    if (!channelId) {
      setMessages([])
      return
    }
    void window.api.teamRun.collaboration
      .listMessages(channelId)
      .then(setMessages)
      .catch(reportError)
  }, [channelId])

  const createChannel = async () => {
    if (!projectId || !channelName.trim()) return
    try {
      const created = await window.api.teamRun.collaboration.createChannel({
        projectId,
        channel: { name: channelName.trim().toLowerCase(), description: '' }
      })
      setChannels((current) => [...current, created])
      setChannelId(created.id)
      setChannelName('')
    } catch (error) {
      if (
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.TeamCollaborationDialog.createChannelError',
            'Unable to create channel'
          )
        )
      )
        setChannelName('')
    }
  }

  const sendMessage = async () => {
    if (!channelId || !message.trim()) return
    try {
      const created = await window.api.teamRun.collaboration.createMessage({
        channelId,
        message: { bodyMarkdown: message.trim() }
      })
      setMessages((current) => [...current, created])
      setMessage('')
    } catch (error) {
      if (
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.TeamCollaborationDialog.sendMessageError',
            'Unable to send message'
          )
        )
      )
        setMessage('')
    }
  }

  const createTeamAgent = async () => {
    if (!projectId || !agentName.trim()) return
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
      setTeamAgents((current) => [...current, created])
      setAgentName('')
      setLaunchCommand('')
      setInstructions('')
    } catch (error) {
      if (
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.TeamCollaborationDialog.createAgentError',
            'Unable to create Team Agent'
          )
        )
      ) {
        setAgentName('')
        setInstructions('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!projectId}>
          <MessagesSquare />{' '}
          {translate(
            'auto.components.team.space.TeamCollaborationDialog.b945e8ba1c',
            'Collaborate'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.TeamCollaborationDialog.d08c4fdd59',
              'Project collaboration'
            )}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="channels" className="min-h-0">
          <TabsList>
            <TabsTrigger value="channels">
              <MessagesSquare />{' '}
              {translate(
                'auto.components.team.space.TeamCollaborationDialog.3864000c86',
                'Channels'
              )}
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Bot />{' '}
              {translate(
                'auto.components.team.space.TeamCollaborationDialog.9a71d6f2db',
                'Team Agents'
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="channels" className="min-h-0 space-y-3">
            <div className="flex gap-2">
              <Input
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder={translate(
                  'auto.components.team.space.TeamCollaborationDialog.33cbbbe531',
                  'channel-name'
                )}
              />
              <Button variant="outline" onClick={createChannel} disabled={!channelName.trim()}>
                <Plus />{' '}
                {translate('auto.components.team.space.TeamCollaborationDialog.48b5d0079f', 'Add')}
              </Button>
            </div>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={translate(
                    'auto.components.team.space.TeamCollaborationDialog.bced45584d',
                    'Choose a channel'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    # {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="scrollbar-sleek max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {messages.map((entry) => (
                <div key={entry.id} className="rounded-md bg-muted/40 p-2">
                  <p className="whitespace-pre-wrap text-sm">{entry.bodyMarkdown}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TeamCollaborationDialog.657eac68c5',
                    'No channel messages yet.'
                  )}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={translate(
                  'auto.components.team.space.TeamCollaborationDialog.343ca1bd98',
                  'Share project context'
                )}
              />
              <Button onClick={sendMessage} disabled={!channelId || !message.trim()}>
                <Send />{' '}
                {translate('auto.components.team.space.TeamCollaborationDialog.50d5256799', 'Send')}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="agents" className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-2">
              <Input
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
                placeholder={translate(
                  'auto.components.team.space.TeamCollaborationDialog.478185f70b',
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
                      'auto.components.team.space.TeamCollaborationDialog.genericCli',
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
                    'auto.components.team.space.TeamCollaborationDialog.launchCommand',
                    'Command that accepts task context as its final argument'
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TeamCollaborationDialog.launchCommandHint',
                    'The command is shared with project members. Keep credentials in the host environment.'
                  )}
                </p>
              </div>
            ) : null}
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={translate(
                'auto.components.team.space.TeamCollaborationDialog.4b903cf9fb',
                'Reusable instructions added before the frozen task context'
              )}
            />
            <Button
              onClick={createTeamAgent}
              disabled={!agentName.trim() || (agentKind === 'generic-cli' && !launchCommand.trim())}
            >
              <Plus />{' '}
              {translate(
                'auto.components.team.space.TeamCollaborationDialog.04cd97be0f',
                'Create Team Agent'
              )}
            </Button>
            <div className="scrollbar-sleek max-h-56 space-y-2 overflow-y-auto">
              {teamAgents.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">{entry.agentKind}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {entry.instructionsMarkdown ||
                      translate(
                        'auto.components.team.space.TeamCollaborationDialog.8753302558',
                        'No additional instructions'
                      )}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function reportError(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.team.space.TeamCollaborationDialog.9bca007245',
          'TeamRun collaboration request failed'
        )
  )
}

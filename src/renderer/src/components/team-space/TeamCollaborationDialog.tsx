import { useEffect, useState } from 'react'
import { Bot, MessagesSquare, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { Channel, ChannelMessage } from '../../../../shared/teamrun-api'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { TeamAgentManagement } from './TeamAgentManagement'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  projectId: string | null
  compact?: boolean
  initialTab?: 'channels' | 'agents'
}

export function TeamCollaborationDialog({
  projectId,
  compact = false,
  initialTab = 'channels'
}: Props) {
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState('')
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [channelName, setChannelName] = useState('')
  const [message, setMessage] = useState('')
  const triggerLabel = compact
    ? translate('auto.components.team.space.TeamCollaborationDialog.agents', 'Agents')
    : translate('auto.components.team.space.TeamCollaborationDialog.b945e8ba1c', 'Collaborate')

  useEffect(() => {
    if (!open || !projectId) {
      return
    }
    void window.api.teamRun.collaboration
      .listChannels(projectId)
      .then((nextChannels) => {
        setChannels(nextChannels)
        setChannelId((current) =>
          current && nextChannels.some((channel) => channel.id === current)
            ? current
            : (nextChannels[0]?.id ?? '')
        )
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
    if (!projectId || !channelName.trim()) {
      return
    }
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
      ) {
        setChannelName('')
      }
    }
  }

  const sendMessage = async () => {
    if (!channelId || !message.trim()) {
      return
    }
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
      ) {
        setMessage('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant={compact ? 'ghost' : 'outline'}
              size="sm"
              aria-label={triggerLabel}
              disabled={!projectId}
            >
              {compact ? <Bot /> : <MessagesSquare />}{' '}
              <span className={compact ? 'team-space-dock-label' : undefined}>{triggerLabel}</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={4}
          className={compact ? 'team-space-compact-dock-tooltip hidden' : 'hidden'}
        >
          {triggerLabel}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {initialTab === 'agents'
              ? translate(
                  'auto.components.team.space.TeamCollaborationDialog.agentManagement',
                  'Agent management'
                )
              : translate(
                  'auto.components.team.space.TeamCollaborationDialog.d08c4fdd59',
                  'Project collaboration'
                )}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={initialTab} className="min-h-0">
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
          <TabsContent value="agents">
            <TeamAgentManagement projectId={projectId} active={open} />
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

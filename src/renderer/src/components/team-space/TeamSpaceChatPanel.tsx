import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, Hash, Loader2, MessageCircle, Send, UsersRound } from 'lucide-react'
import type {
  Channel,
  ChannelMessage,
  OrganizationMember,
  TeamAgent
} from '../../../../shared/teamrun-api'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

type Props = {
  projectId: string | null
  authEmail: string | null
  channels: Channel[]
  channelId: string | null
  messages: ChannelMessage[]
  members: OrganizationMember[]
  teamAgents: TeamAgent[]
  loading: boolean
  sending: boolean
  replyingAgentIds: string[]
  onSelectChannel: (channelId: string) => void
  onCreateGeneralChannel: () => Promise<void>
  onSendMessage: (bodyMarkdown: string) => Promise<boolean>
}

type Author = {
  name: string
  isAgent: boolean
  isCurrentUser: boolean
}

function getAuthor(
  message: ChannelMessage,
  members: OrganizationMember[],
  teamAgents: TeamAgent[],
  authEmail: string | null
): Author {
  const agent = teamAgents.find((entry) => entry.id === message.authorTeamAgentId)
  if (agent) {
    return { name: agent.name, isAgent: true, isCurrentUser: false }
  }
  const member = members.find((entry) => entry.userId === message.authorUserId)
  return {
    name:
      member?.displayName ??
      translate('auto.components.team.space.TeamSpaceChatPanel.teamMember', 'Team member'),
    isAgent: false,
    isCurrentUser: Boolean(member && authEmail && member.email === authEmail)
  }
}

function ChatMessage({ message, author }: { message: ChannelMessage; author: Author }) {
  return (
    <article className="group flex gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {author.isAgent ? (
          <Bot className="size-4" />
        ) : (
          <span className="text-xs font-semibold">{author.name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{author.name}</span>
          {author.isCurrentUser ? (
            <span className="text-xs text-muted-foreground">
              {translate('auto.components.team.space.TeamSpaceChatPanel.you', 'You')}
            </span>
          ) : null}
          {author.isAgent ? (
            <Badge variant="secondary">
              {translate('auto.components.team.space.TeamSpaceChatPanel.agent', 'Agent')}
            </Badge>
          ) : null}
          <time className="text-xs text-muted-foreground">
            {new Date(message.createdAt).toLocaleString()}
          </time>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
          <CommentMarkdown content={message.bodyMarkdown} />
        </div>
      </div>
    </article>
  )
}

export function TeamSpaceChatPanel(props: Props) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const selectedChannel = props.channels.find((channel) => channel.id === props.channelId) ?? null
  const chatAgents = props.teamAgents.filter((agent) => agent.agentKind === 'codex')
  const replyingAgents = props.teamAgents.filter((agent) =>
    props.replyingAgentIds.includes(agent.id)
  )
  const participantCount = props.members.length + props.teamAgents.length
  const messageAuthors = useMemo(
    () =>
      props.messages.map((message) =>
        getAuthor(message, props.members, props.teamAgents, props.authEmail)
      ),
    [props.authEmail, props.members, props.messages, props.teamAgents]
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [props.messages])

  const send = async () => {
    const message = draft.trim()
    if (!message) {
      return
    }
    if (await props.onSendMessage(message)) {
      setDraft('')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    void send()
  }

  const mentionAgent = (agent: TeamAgent) => {
    setDraft(
      (current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${agent.name} `
    )
  }

  if (!props.projectId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <MessageCircle className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">
            {translate('auto.components.team.space.TeamSpaceChatPanel.noProject', 'No project yet')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamSpaceChatPanel.noProjectHint',
              'Create or choose a project from More to start a team chat.'
            )}
          </p>
        </div>
      </div>
    )
  }

  if (props.loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {translate('auto.components.team.space.TeamSpaceChatPanel.loading', 'Loading chat…')}
      </div>
    )
  }

  if (props.channels.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <MessageCircle className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">
            {translate(
              'auto.components.team.space.TeamSpaceChatPanel.startConversation',
              'Start the team conversation'
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamSpaceChatPanel.startConversationHint',
              'Create a general channel for people and Agents to coordinate in one place.'
            )}
          </p>
          <Button className="mt-4" onClick={props.onCreateGeneralChannel}>
            <MessageCircle />
            {translate(
              'auto.components.team.space.TeamSpaceChatPanel.createGeneral',
              'Start group chat'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <Select value={props.channelId ?? ''} onValueChange={props.onSelectChannel}>
          <SelectTrigger className="h-8 w-auto min-w-40 border-0 bg-transparent px-2 shadow-none">
            <Hash className="size-4 text-muted-foreground" />
            <SelectValue
              placeholder={translate(
                'auto.components.team.space.TeamSpaceChatPanel.channel',
                'Channel'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {props.channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <UsersRound className="size-3.5 shrink-0" />
          <span className="truncate">
            {translate(
              'auto.components.team.space.TeamSpaceChatPanel.participants',
              '{{value0}} participants',
              { value0: participantCount }
            )}
          </span>
          {props.teamAgents.length > 0 ? (
            <Badge variant="outline" className="shrink-0 gap-1 font-normal">
              <Bot className="size-3" /> {props.teamAgents.length}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-5">
        <div className="mx-auto max-w-3xl py-4">
          {selectedChannel && props.messages.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Hash className="size-5" />
              </div>
              <h2 className="mt-3 text-sm font-semibold">{selectedChannel.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedChannel.description ||
                  translate(
                    'auto.components.team.space.TeamSpaceChatPanel.firstMessage',
                    'Send the first message to your team.'
                  )}
              </p>
            </div>
          ) : null}
          {props.messages.map((message, index) => (
            <ChatMessage key={message.id} message={message} author={messageAuthors[index]} />
          ))}
          {replyingAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2 py-3 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {translate(
                'auto.components.team.space.TeamSpaceChatPanel.agentReplying',
                '{{value0}} is replying…',
                { value0: agent.name }
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="shrink-0 px-4 pt-2 pb-3">
        <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-2 shadow-xs">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-14 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-label={translate(
              'auto.components.team.space.TeamSpaceChatPanel.messageLabel',
              'Message'
            )}
            placeholder={
              selectedChannel
                ? translate(
                    'auto.components.team.space.TeamSpaceChatPanel.messagePlaceholder',
                    'Message #{{value0}} or @ an Agent',
                    { value0: selectedChannel.name }
                  )
                : translate(
                    'auto.components.team.space.TeamSpaceChatPanel.chooseChannel',
                    'Choose a channel'
                  )
            }
            disabled={!selectedChannel || props.sending}
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={chatAgents.length === 0 || !selectedChannel}
                >
                  <Bot />
                  {translate(
                    'auto.components.team.space.TeamSpaceChatPanel.mentionAgent',
                    'Mention Codex Agent'
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                {chatAgents.map((agent) => (
                  <DropdownMenuItem key={agent.id} onSelect={() => mentionAgent(agent)}>
                    <Bot /> {agent.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.team.space.TeamSpaceChatPanel.send',
                    'Send message'
                  )}
                  disabled={!selectedChannel || !draft.trim() || props.sending}
                  onClick={send}
                >
                  <Send />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.team.space.TeamSpaceChatPanel.sendHint',
                  'Send · Enter'
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}

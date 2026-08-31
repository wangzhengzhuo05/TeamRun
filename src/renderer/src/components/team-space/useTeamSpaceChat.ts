import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  Channel,
  ChannelMessage,
  OrganizationMember,
  TeamAgent
} from '../../../../shared/teamrun-api'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type TeamSpaceChat = {
  channels: Channel[]
  channelId: string | null
  messages: ChannelMessage[]
  members: OrganizationMember[]
  teamAgents: TeamAgent[]
  loading: boolean
  sending: boolean
  replyingAgentIds: string[]
  selectChannel: (channelId: string) => void
  sendMessage: (bodyMarkdown: string) => Promise<boolean>
  createGeneralChannel: () => Promise<void>
  refresh: () => Promise<void>
}

function reportError(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate('auto.components.team.space.useTeamSpaceChat.loadError', 'Unable to load chat')
  )
}

function mentionedChatAgents(message: string, agents: TeamAgent[]): TeamAgent[] {
  const lower = message.toLocaleLowerCase()
  return agents.filter((agent) => {
    if (!['codex', 'claude', 'opencode'].includes(agent.agentKind)) {
      return false
    }
    const mention = `@${agent.name.toLocaleLowerCase()}`
    let offset = lower.indexOf(mention)
    while (offset >= 0) {
      const before = lower[offset - 1]
      const after = lower[offset + mention.length]
      if ((!before || /\s/.test(before)) && (!after || /[\s.,!?;:)]/.test(after))) {
        return true
      }
      offset = lower.indexOf(mention, offset + mention.length)
    }
    return false
  })
}

export function useTeamSpaceChat(
  organizationId: string | null,
  projectId: string | null,
  eventRevision: number
): TeamSpaceChat {
  const [channels, setChannels] = useState<Channel[]>([])
  const [channelId, setChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [replyingAgentIds, setReplyingAgentIds] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!projectId || !organizationId) {
      return
    }
    const [nextChannels, nextMembers, nextAgents] = await Promise.all([
      window.api.teamRun.collaboration.listChannels(projectId),
      window.api.teamRun.organizations.listMembers(organizationId),
      window.api.teamRun.collaboration.listTeamAgents(projectId)
    ])
    setChannels(nextChannels)
    setMembers(nextMembers)
    setTeamAgents(nextAgents)
    setChannelId((current) =>
      current && nextChannels.some((channel) => channel.id === current)
        ? current
        : (nextChannels[0]?.id ?? null)
    )
  }, [organizationId, projectId])

  useEffect(() => {
    setChannels([])
    setChannelId(null)
    setMessages([])
    setMembers([])
    setTeamAgents([])
    if (!projectId || !organizationId) {
      return
    }
    let active = true
    setLoading(true)
    void refresh()
      .catch(reportError)
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [organizationId, projectId, refresh])

  useEffect(() => {
    if (!eventRevision || !projectId || !organizationId) {
      return
    }
    void refresh().catch(reportError)
  }, [eventRevision, organizationId, projectId, refresh])

  useEffect(() => {
    setMessages([])
    if (!channelId) {
      return
    }
    let active = true
    void window.api.teamRun.collaboration
      .listMessages(channelId)
      .then((next) => active && setMessages(next))
      .catch(reportError)
    return () => {
      active = false
    }
  }, [channelId, eventRevision])

  const sendMessage = useCallback(
    async (bodyMarkdown: string) => {
      if (!channelId || sending) {
        return false
      }
      setSending(true)
      try {
        const created = await window.api.teamRun.collaboration.createMessage({
          channelId,
          message: { bodyMarkdown }
        })
        setMessages((current) => [...current, created])
        if (projectId) {
          const agents = mentionedChatAgents(bodyMarkdown, teamAgents)
          for (const agent of agents) {
            setReplyingAgentIds((current) => [...new Set([...current, agent.id])])
            void window.api.teamRun.collaboration
              .reply({
                projectId,
                channelId,
                teamAgentId: agent.id,
                bodyMarkdown
              })
              .then((reply) =>
                setMessages((current) =>
                  current.some((message) => message.id === reply.id) ? current : [...current, reply]
                )
              )
              .catch(() =>
                toast.error(
                  translate(
                    'auto.components.team.space.useTeamSpaceChat.agentReplyError',
                    'Agent could not reply. Check that its local API key is configured.'
                  )
                )
              )
              .finally(() =>
                setReplyingAgentIds((current) => current.filter((agentId) => agentId !== agent.id))
              )
          }
        }
        return true
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.useTeamSpaceChat.sendError',
            'Unable to send message'
          )
        )
        return false
      } finally {
        setSending(false)
      }
    },
    [channelId, projectId, sending, teamAgents]
  )

  const createGeneralChannel = useCallback(async () => {
    if (!projectId) {
      return
    }
    try {
      const created = await window.api.teamRun.collaboration.createChannel({
        projectId,
        channel: {
          name: 'general',
          description: translate(
            'auto.components.team.space.useTeamSpaceChat.generalDescription',
            'Team conversation'
          )
        }
      })
      setChannels((current) => [...current, created])
      setChannelId(created.id)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.useTeamSpaceChat.createChannelError',
          'Unable to start chat'
        )
      )
    }
  }, [projectId])

  return {
    channels,
    channelId,
    messages,
    members,
    teamAgents,
    loading,
    sending,
    replyingAgentIds,
    selectChannel: setChannelId,
    sendMessage,
    createGeneralChannel,
    refresh
  }
}

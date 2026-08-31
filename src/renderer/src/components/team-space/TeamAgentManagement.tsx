import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ModelConnection, TeamAgent, TeamServerBinding } from '../../../../shared/teamrun-api'
import { Separator } from '@/components/ui/separator'
import { translate } from '@/i18n/i18n'
import { teamRunErrorMessage } from './teamrun-error-message'
import { TeamAgentDefinitionSection } from './TeamAgentDefinitionSection'
import { TeamServerModelConnectionSection } from './TeamServerModelConnectionSection'
import { TeamServerSetupSection } from './TeamServerSetupSection'

type Props = {
  projectId: string | null
  active: boolean
  canManage: boolean
}

export function TeamAgentManagement({ projectId, active, canManage }: Props) {
  const [teamServer, setTeamServer] = useState<TeamServerBinding | null>(null)
  const [connections, setConnections] = useState<ModelConnection[]>([])
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([])

  const load = useCallback(async () => {
    if (!projectId) {
      return
    }
    const [nextServer, nextConnections, nextAgents] = await Promise.all([
      window.api.teamRun.collaboration.getTeamServer(projectId),
      window.api.teamRun.collaboration.listModelConnections(projectId),
      window.api.teamRun.collaboration.listTeamAgents(projectId)
    ])
    setTeamServer(nextServer)
    setConnections(nextConnections)
    setTeamAgents(nextAgents)
  }, [projectId])

  useEffect(() => {
    if (!active || !projectId) {
      return
    }
    void load().catch(reportLoadError)
  }, [active, load, projectId])

  return (
    <div className="scrollbar-sleek max-h-[60vh] space-y-5 overflow-y-auto pr-1">
      <TeamServerSetupSection
        projectId={projectId}
        teamServer={teamServer}
        canManage={canManage}
        onEnrolled={setTeamServer}
      />
      <Separator />
      <TeamServerModelConnectionSection
        projectId={projectId}
        teamServer={teamServer}
        connections={connections}
        canManage={canManage}
        onCreated={(connection) => setConnections((current) => [...current, connection])}
      />
      <Separator />
      <TeamAgentDefinitionSection
        projectId={projectId}
        connections={connections}
        teamAgents={teamAgents}
        canManage={canManage}
        onCreated={(agent) => setTeamAgents((current) => [...current, agent])}
      />
    </div>
  )
}

function reportLoadError(error: unknown): void {
  toast.error(
    teamRunErrorMessage(
      error,
      translate(
        'auto.components.team.space.TeamAgentManagement.loadError',
        'Unable to load Team Agent settings'
      )
    )
  )
}

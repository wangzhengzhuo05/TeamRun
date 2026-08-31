import { useEffect, useState } from 'react'
import { Loader2, Server } from 'lucide-react'
import type { TeamServerBinding } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  projectId: string | null
  teamServer: TeamServerBinding | null
  canManage: boolean
  onEnrolled: (binding: TeamServerBinding) => void
}

export function TeamServerSetupSection(props: Props) {
  const [name, setName] = useState(() =>
    translate('auto.components.team.space.TeamAgentManagement.teamServer', 'Team Server')
  )
  const [pairingCode, setPairingCode] = useState('')
  const [showForm, setShowForm] = useState(props.teamServer === null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setShowForm(props.teamServer === null), [props.teamServer])

  const enroll = async () => {
    if (!props.projectId || !name.trim() || !pairingCode.trim()) {
      return
    }
    setSubmitting(true)
    try {
      const binding = await window.api.teamRun.collaboration.enrollTeamServer({
        projectId: props.projectId,
        teamServer: { name: name.trim(), pairingCode: pairingCode.trim() }
      })
      props.onEnrolled(binding)
      setPairingCode('')
      setShowForm(false)
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentManagement.enrollServerError',
          'Unable to bind Team Server'
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Server className="size-4" />
            {translate('auto.components.team.space.TeamAgentManagement.teamServer', 'Team Server')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.team.space.TeamAgentManagement.teamServerDescription',
              'One Linux runtime executes the same Team Agents for every member.'
            )}
          </p>
        </div>
        {props.canManage && props.teamServer ? (
          <Button variant="outline" size="sm" onClick={() => setShowForm((value) => !value)}>
            {translate(
              'auto.components.team.space.TeamAgentManagement.replaceServer',
              'Replace server'
            )}
          </Button>
        ) : null}
      </div>

      {props.teamServer ? <TeamServerSummary binding={props.teamServer} /> : null}
      {!props.teamServer && !props.canManage ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.serverOwnerRequired',
            'The Team Owner must bind a Team Server before Team Agents can run.'
          )}
        </p>
      ) : null}
      {props.canManage && showForm ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-2">
            <Label htmlFor="team-server-name">
              {translate(
                'auto.components.team.space.TeamAgentManagement.serverName',
                'Server name'
              )}
            </Label>
            <Input
              id="team-server-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-server-pairing-code">
              {translate(
                'auto.components.team.space.TeamAgentManagement.pairingCode',
                'One-time pairing code'
              )}
            </Label>
            <Textarea
              id="team-server-pairing-code"
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="orca://pair?code=…"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.team.space.TeamAgentManagement.pairingHint',
                'Generate runtime access on the Linux Team Server. Replacing it immediately resets the active server.'
              )}
            </p>
          </div>
          <Button onClick={() => void enroll()} disabled={submitting || !pairingCode.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : <Server />}
            {submitting
              ? translate(
                  'auto.components.team.space.TeamAgentManagement.verifyingServer',
                  'Verifying Team Server…'
                )
              : translate(
                  'auto.components.team.space.TeamAgentManagement.bindServer',
                  'Bind Team Server'
                )}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function TeamServerSummary({ binding }: { binding: TeamServerBinding }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{binding.name}</span>
        <span className="text-xs text-muted-foreground">v{binding.version}</span>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{binding.endpoint}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
        {binding.runtimeId}
      </p>
    </div>
  )
}

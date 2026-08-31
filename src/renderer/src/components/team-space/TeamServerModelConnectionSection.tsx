import { useState } from 'react'
import type { ReactNode } from 'react'
import { Cable, Loader2, Plus } from 'lucide-react'
import type { ModelConnection, TeamServerBinding } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'

type Props = {
  projectId: string | null
  teamServer: TeamServerBinding | null
  connections: ModelConnection[]
  canManage: boolean
  onCreated: (connection: ModelConnection) => void
}

export function TeamServerModelConnectionSection(props: Props) {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const create = async () => {
    if (!props.projectId || !name.trim() || !baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      return
    }
    setSubmitting(true)
    try {
      const connection = await window.api.teamRun.collaboration.createModelConnection({
        projectId: props.projectId,
        connection: {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim()
        }
      })
      props.onCreated(connection)
      setName('')
      setBaseUrl('')
      setApiKey('')
      setModel('')
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.TeamAgentManagement.createConnectionError',
          'Unable to create Model Connection'
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
          <Cable className="size-4" />
          {translate(
            'auto.components.team.space.TeamAgentManagement.modelConnections',
            'Model Connections'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.modelConnectionDescription',
            'Base URL and model are shared metadata. The API key stays encrypted on the Team Server.'
          )}
        </p>
      </div>

      <div className="space-y-2">
        {props.connections.map((connection) => (
          <div key={connection.id} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{connection.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{connection.model}</span>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {connection.baseUrl}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {connection.keyConfigured
                ? translate(
                    'auto.components.team.space.TeamAgentManagement.serverKeyConfigured',
                    'API key configured on Team Server'
                  )
                : translate(
                    'auto.components.team.space.TeamAgentManagement.serverKeyMissing',
                    'API key is not configured'
                  )}
            </p>
          </div>
        ))}
      </div>

      {!props.teamServer ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.team.space.TeamAgentManagement.bindServerFirst',
            'Bind a Team Server before adding a Model Connection.'
          )}
        </p>
      ) : null}
      {props.teamServer && props.canManage ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="team-model-connection-name"
              label={translate(
                'auto.components.team.space.TeamAgentManagement.connectionName',
                'Connection name'
              )}
            >
              {(id) => (
                <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />
              )}
            </Field>
            <Field
              id="team-model-model"
              label={translate('auto.components.team.space.TeamAgentManagement.model', 'Model')}
            >
              {(id) => (
                <Input
                  id={id}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="gpt-5.2"
                  className="font-mono"
                />
              )}
            </Field>
          </div>
          <Field
            id="team-model-base-url"
            label={translate('auto.components.team.space.TeamAgentManagement.baseUrl', 'Base URL')}
          >
            {(id) => (
              <Input
                id={id}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                className="font-mono"
              />
            )}
          </Field>
          <Field
            id="team-model-api-key"
            label={translate('auto.components.team.space.TeamAgentManagement.apiKey', 'API key')}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Button
            onClick={() => void create()}
            disabled={
              submitting || !name.trim() || !baseUrl.trim() || !apiKey.trim() || !model.trim()
            }
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
            {submitting
              ? translate(
                  'auto.components.team.space.TeamAgentManagement.configuringConnection',
                  'Configuring Team Server…'
                )
              : translate(
                  'auto.components.team.space.TeamAgentManagement.createConnection',
                  'Create Model Connection'
                )}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function Field(props: { id: string; label: string; children: (id: string) => ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children(props.id)}
    </div>
  )
}

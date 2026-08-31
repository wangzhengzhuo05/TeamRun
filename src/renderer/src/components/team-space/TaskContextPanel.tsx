import { useEffect, useState } from 'react'
import { Camera, Check, Copy } from 'lucide-react'
import type { ContextSnapshot, TeamFile } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { supportsTeamFileText } from './team-file-content'

type Props = {
  snapshots: ContextSnapshot[]
  teamFiles: TeamFile[]
  canCreate: boolean
  onCreate: (options: {
    selectedTeamFileVersionIds: string[]
    autoEnrich: boolean
  }) => Promise<ContextSnapshot | null>
}

export function TaskContextPanel({ snapshots, teamFiles, canCreate, onCreate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(snapshots[0]?.id ?? null)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [autoEnrich, setAutoEnrich] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selectedId || !snapshots.some((snapshot) => snapshot.id === selectedId)) {
      setSelectedId(snapshots[0]?.id ?? null)
    }
  }, [selectedId, snapshots])

  const availableFiles = teamFiles.filter(
    (file) => file.currentAvailability === 'available' && supportsTeamFileText(file.currentMimeType)
  )

  useEffect(() => {
    setSelectedFileIds((current) =>
      current.filter((id) =>
        teamFiles.some(
          (file) =>
            file.id === id &&
            file.currentAvailability === 'available' &&
            supportsTeamFileText(file.currentMimeType)
        )
      )
    )
  }, [teamFiles])

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null
  const create = async () => {
    const snapshot = await onCreate({
      selectedTeamFileVersionIds: availableFiles
        .filter((file) => selectedFileIds.includes(file.id))
        .map((file) => file.currentVersionId),
      autoEnrich
    })
    if (snapshot) {
      setSelectedId(snapshot.id)
    }
  }
  const copy = async () => {
    if (!selected) {
      return
    }
    await navigator.clipboard.writeText(selected.renderedMarkdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="team-space-context grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden">
      <aside className="team-space-context-list flex min-h-0 flex-col border-r border-border bg-muted/20">
        <div className="space-y-3 border-b border-border p-2">
          <div>
            <p className="px-1 text-xs font-medium">
              {translate('auto.components.team.space.TaskContextPanel.teamFiles', 'Team Files')}
            </p>
            <div className="scrollbar-sleek mt-2 max-h-36 space-y-1 overflow-y-auto">
              {availableFiles.map((file) => (
                <label
                  key={file.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedFileIds.includes(file.id)}
                    onCheckedChange={(checked) =>
                      setSelectedFileIds((current) =>
                        checked === true
                          ? [...new Set([...current, file.id])]
                          : current.filter((id) => id !== file.id)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {file.path} · v{file.currentVersion}
                  </span>
                </label>
              ))}
              {availableFiles.length === 0 ? (
                <p className="px-1 text-xs leading-5 text-muted-foreground">
                  {translate(
                    'auto.components.team.space.TaskContextPanel.noTeamFiles',
                    'No text Team Files are available.'
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-2 px-1 text-xs">
            <span>
              {translate(
                'auto.components.team.space.TaskContextPanel.autoEnrich',
                'Ask Agent to add context'
              )}
            </span>
            <Switch checked={autoEnrich} onCheckedChange={setAutoEnrich} />
          </label>
          <Button className="w-full" size="sm" disabled={!canCreate} onClick={create}>
            <Camera />{' '}
            {translate('auto.components.team.space.TaskContextPanel.0476dbda6b', 'Freeze context')}
          </Button>
        </div>
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
          {snapshots.map((snapshot) => (
            <button
              key={snapshot.id}
              type="button"
              onClick={() => setSelectedId(snapshot.id)}
              className={cn(
                'mb-1 w-full rounded-md px-2 py-2 text-left text-xs',
                snapshot.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
            >
              <div className="font-medium">
                {translate('auto.components.team.space.TaskContextPanel.9b187a9ca8', 'Task v')}
                {snapshot.taskVersion}
              </div>
              {snapshot.teamFileVersionIds.length > 0 ? (
                <div className="mt-1 text-muted-foreground">
                  {translate('auto.components.team.space.TaskContextPanel.files', 'Files')}:{' '}
                  {snapshot.teamFileVersionIds.length}
                </div>
              ) : null}
              <div className="mt-1 truncate text-muted-foreground">
                {snapshot.hash.slice(0, 12)}
              </div>
            </button>
          ))}
          {snapshots.length === 0 ? (
            <p className="p-2 text-xs leading-5 text-muted-foreground">
              {translate(
                'auto.components.team.space.TaskContextPanel.c46a2234e3',
                'Freeze context before launching agents. Runs always reference an immutable snapshot.'
              )}
            </p>
          ) : null}
        </div>
      </aside>
      <section className="scrollbar-sleek min-h-0 overflow-y-auto p-5">
        {selected ? (
          <>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Badge variant="outline" className="shrink-0">
                  {translate('auto.components.team.space.TaskContextPanel.d2f82c4681', 'SHA-256')}
                </Badge>
                <code className="min-w-0 truncate text-xs text-muted-foreground">
                  {selected.hash}
                </code>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={copy}>
                {copied ? <Check /> : <Copy />}{' '}
                {copied
                  ? translate('auto.components.team.space.TaskContextPanel.4cd7e8b7c8', 'Copied')
                  : translate('auto.components.team.space.TaskContextPanel.781ed2c6bf', 'Copy')}
              </Button>
            </div>
            <CommentMarkdown content={selected.renderedMarkdown} variant="document" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate(
              'auto.components.team.space.TaskContextPanel.bc37efd95f',
              'No context snapshot selected.'
            )}
          </div>
        )}
      </section>
    </div>
  )
}

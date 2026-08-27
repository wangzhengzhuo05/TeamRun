import { useEffect, useState } from 'react'
import { Camera, Check, Copy } from 'lucide-react'
import type { ContextSnapshot } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type Props = {
  snapshots: ContextSnapshot[]
  onCreate: () => Promise<ContextSnapshot | null>
}

export function TaskContextPanel({ snapshots, onCreate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(snapshots[0]?.id ?? null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!selectedId || !snapshots.some((snapshot) => snapshot.id === selectedId)) {
      setSelectedId(snapshots[0]?.id ?? null)
    }
  }, [selectedId, snapshots])

  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? null
  const create = async () => {
    const snapshot = await onCreate()
    if (snapshot) setSelectedId(snapshot.id)
  }
  const copy = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(selected.renderedMarkdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="team-space-context grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden">
      <aside className="team-space-context-list flex min-h-0 flex-col border-r border-border bg-muted/20">
        <div className="border-b border-border p-2">
          <Button className="w-full" size="sm" onClick={create}>
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

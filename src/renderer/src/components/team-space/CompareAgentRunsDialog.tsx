import { useMemo, useState } from 'react'
import { Columns2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRun } from '../../../../shared/teamrun-api'
import type { TeamRunWorkspaceReview } from '../../../../shared/teamrun-cloud'
import { getAgentLabel } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

type Props = { runs: AgentRun[] }
type ReviewState = { run: AgentRun; review: TeamRunWorkspaceReview }

function runLabel(run: AgentRun, index: number): string {
  const agent = run.teamAgentSnapshot?.name ?? getAgentLabel(run.agentKind as TuiAgent)
  return translate(
    'auto.components.team.space.CompareAgentRunsDialog.resultLabel',
    '{{agent}} · Result {{number}}',
    { agent, number: index + 1 }
  )
}

function ReviewPane({ state, label }: { state: ReviewState | null; label: string }) {
  if (!state) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.team.space.CompareAgentRunsDialog.af763732b3',
          'Select a result.'
        )}
      </div>
    )
  }
  const { review } = state
  const head = review.headRevision.kind === 'git' ? review.headRevision.objectId.slice(0, 12) : null
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card">
      <header className="border-b border-border px-3 py-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {head
            ? translate(
                'auto.components.team.space.CompareAgentRunsDialog.workspaceSummary',
                '{{value0}} · {{value1}} commit{{value2}}{{value3}}',
                {
                  value0: head,
                  value1: review.commitGitObjectIds.length,
                  value2: review.commitGitObjectIds.length === 1 ? '' : 's',
                  value3: review.hasUncommittedChanges
                    ? translate(
                        'auto.components.team.space.CompareAgentRunsDialog.workingTreeIncluded',
                        ' · working tree included'
                      )
                    : ''
                }
              )
            : translate(
                'auto.components.team.space.CompareAgentRunsDialog.0f828b971d',
                'Folder workspace · Git diff unavailable'
              )}
        </div>
      </header>
      <pre className="scrollbar-sleek max-h-[55vh] min-h-64 overflow-auto whitespace-pre p-3 font-mono text-xs">
        {review.unifiedDiff ||
          translate(
            'auto.components.team.space.CompareAgentRunsDialog.noWorkspaceChanges',
            'No workspace changes.'
          )}
      </pre>
    </section>
  )
}

export function CompareAgentRunsDialog({ runs }: Props) {
  const eligible = useMemo(
    () => runs.filter((run) => ['review', 'completed'].includes(run.status)),
    [runs]
  )
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<[string, string]>([
    eligible[0]?.id ?? '',
    eligible[1]?.id ?? ''
  ])
  const [reviews, setReviews] = useState<[ReviewState | null, ReviewState | null]>([null, null])
  const [loading, setLoading] = useState(false)

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedIds([eligible[0]?.id ?? '', eligible[1]?.id ?? ''])
      setReviews([null, null])
    }
    setOpen(nextOpen)
  }

  const load = async () => {
    const selected = selectedIds
      .map((id) => eligible.find((run) => run.id === id))
      .filter((run): run is AgentRun => Boolean(run))
    if (selected.length === 0) return
    setLoading(true)
    try {
      const next = await Promise.all(
        selected.map(async (run) => ({
          run,
          review: await window.api.teamRun.runs.reviewWorkspace({
            runId: run.id,
            clientRunId: run.clientRunId
          })
        }))
      )
      setReviews([next[0] ?? null, next[1] ?? null])
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.team.space.CompareAgentRunsDialog.dda2dc9fdd',
              'Unable to read the selected result.'
            )
      )
    } finally {
      setLoading(false)
    }
  }

  const select = (position: 0 | 1, id: string) => {
    const next: [string, string] = [...selectedIds]
    next[position] = id
    setSelectedIds(next)
    setReviews([null, null])
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={eligible.length === 0}>
          <Columns2 />{' '}
          {translate(
            'auto.components.team.space.CompareAgentRunsDialog.7129fda456',
            'Compare results'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.CompareAgentRunsDialog.a4cd513779',
              'Compare agent results'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.CompareAgentRunsDialog.privacyDescription',
              'Reads committed and uncommitted workspace changes from the execution host. Nothing is uploaded until you publish.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1].map((position) => (
            <Select
              key={position}
              value={selectedIds[position]}
              onValueChange={(id) => select(position as 0 | 1, id)}
            >
              <SelectTrigger className="min-w-52 flex-1">
                <SelectValue
                  placeholder={translate(
                    'auto.components.team.space.CompareAgentRunsDialog.e3abeaefc1',
                    'Result {{value0}}',
                    { value0: position + 1 }
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((run, index) => (
                  <SelectItem
                    key={run.id}
                    value={run.id}
                    disabled={selectedIds[1 - position] === run.id}
                  >
                    {runLabel(run, index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          <Button onClick={load} disabled={loading || !selectedIds[0]}>
            {loading
              ? translate(
                  'auto.components.team.space.CompareAgentRunsDialog.30c09b2873',
                  'Reading…'
                )
              : translate(
                  'auto.components.team.space.CompareAgentRunsDialog.readWorkspaceDiffs',
                  'Read workspace diffs'
                )}
          </Button>
        </div>
        <div className="grid min-h-0 gap-3 overflow-auto md:grid-cols-2">
          <ReviewPane
            state={reviews[0]}
            label={translate(
              'auto.components.team.space.CompareAgentRunsDialog.54331605e9',
              'Result A'
            )}
          />
          <ReviewPane
            state={reviews[1]}
            label={translate(
              'auto.components.team.space.CompareAgentRunsDialog.8bff8ea12f',
              'Result B'
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

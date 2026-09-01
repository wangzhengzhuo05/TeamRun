import { useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRun, VerificationResult } from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { teamRunErrorMessage } from './teamrun-error-message'

type Props = {
  run: AgentRun
  verifications: VerificationResult[]
  onPublished: () => Promise<void>
}

export function PublishAgentResultDialog({ run, verifications, onPublished }: Props) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [reviewUrl, setReviewUrl] = useState('')
  const [includeDiff, setIncludeDiff] = useState(true)
  const [includeChecks, setIncludeChecks] = useState(verifications.length > 0)
  const [publishing, setPublishing] = useState(false)

  const publish = async () => {
    setPublishing(true)
    try {
      await window.api.teamRun.publications.publishSelected({
        runId: run.id,
        clientRunId: run.clientRunId,
        summaryMarkdown: summary.trim(),
        reviewUrl: reviewUrl.trim() || null,
        includeDiff,
        includeVerificationOutput: includeChecks
      })
      toast.success(
        translate(
          'auto.components.team.space.PublishAgentResultDialog.d073bd4a81',
          'Selected result published to the task review.'
        )
      )
      await onPublished()
      setOpen(false)
    } catch (error) {
      toast.error(
        teamRunErrorMessage(
          error,
          translate(
            'auto.components.team.space.PublishAgentResultDialog.b8e3cca263',
            'Publication failed'
          )
        )
      )
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send />{' '}
          {translate(
            'auto.components.team.space.PublishAgentResultDialog.867743a570',
            'Publish result'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.team.space.PublishAgentResultDialog.92e523226a',
              'Publish selected result'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.team.space.PublishAgentResultDialog.9b1cfa92ac',
              'Prompts and full terminal logs stay private. Only the items confirmed below are uploaded.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`teamrun-result-summary-${run.id}`}>
              {translate(
                'auto.components.team.space.PublishAgentResultDialog.db9eebc331',
                'Result summary'
              )}
            </Label>
            <Textarea
              id={`teamrun-result-summary-${run.id}`}
              className="min-h-28"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`teamrun-review-url-${run.id}`}>
              {translate(
                'auto.components.team.space.PublishAgentResultDialog.06b5311e94',
                'Review URL (optional)'
              )}
            </Label>
            <Input
              id={`teamrun-review-url-${run.id}`}
              type="url"
              placeholder={translate(
                'auto.components.team.space.PublishAgentResultDialog.78e54a1db3',
                'https://gitlab.example/team/repo/-/merge_requests/42'
              )}
              value={reviewUrl}
              onChange={(event) => setReviewUrl(event.target.value)}
            />
          </div>
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={includeDiff}
                onCheckedChange={(value) => setIncludeDiff(value === true)}
              />
              <span>
                <span className="font-medium">
                  {translate(
                    'auto.components.team.space.PublishAgentResultDialog.workspaceDiff',
                    'Workspace diff'
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {translate(
                    'auto.components.team.space.PublishAgentResultDialog.workspaceDiffDescription',
                    'Base revision through committed, staged, unstaged, and untracked changes, capped at 5 MiB.'
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={includeChecks}
                disabled={verifications.length === 0}
                onCheckedChange={(value) => setIncludeChecks(value === true)}
              />
              <span>
                <span className="font-medium">
                  {translate(
                    'auto.components.team.space.PublishAgentResultDialog.a12a207165',
                    'Verification output'
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {verifications.length}{' '}
                  {translate(
                    'auto.components.team.space.PublishAgentResultDialog.4081314a98',
                    'explicit check'
                  )}
                  {verifications.length === 1 ? '' : 's'}.
                </span>
              </span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!summary.trim() || publishing} onClick={publish}>
            <Send />{' '}
            {publishing
              ? translate(
                  'auto.components.team.space.PublishAgentResultDialog.a0bbee6251',
                  'Publishing…'
                )
              : translate(
                  'auto.components.team.space.PublishAgentResultDialog.e265aec5cf',
                  'Confirm and publish'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { Download, ExternalLink, GitCommitHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { PublicationArtifact, ResultPublication } from '../../../../shared/teamrun-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'

type Props = { publications: ResultPublication[] }

export function TaskResultsPanel({ publications }: Props) {
  const [artifacts, setArtifacts] = useState<Record<string, PublicationArtifact[]>>({})

  useEffect(() => {
    let active = true
    void Promise.all(
      publications.map(
        async (publication) =>
          [
            publication.id,
            await window.api.teamRun.publications.listArtifacts(publication.id)
          ] as const
      )
    )
      .then((entries) => active && setArtifacts(Object.fromEntries(entries)))
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.team.space.TaskResultsPanel.loadFailed',
                'Unable to load published artifacts'
              )
        )
      )
    return () => {
      active = false
    }
  }, [publications])

  if (publications.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.team.space.TaskResultsPanel.empty',
          'No results have been published yet.'
        )}
      </div>
    )
  }

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        {[...publications].reverse().map((publication) => (
          <article key={publication.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {translate(
                    'auto.components.team.space.TaskResultsPanel.revision',
                    'Revision {{value}}',
                    { value: publication.revision }
                  )}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(publication.publishedAt).toLocaleString()}
                </span>
              </div>
              {publication.reviewUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.api.shell.openUrl(publication.reviewUrl as string)}
                >
                  <ExternalLink />
                  {translate(
                    'auto.components.team.space.TaskResultsPanel.openReview',
                    'Open review'
                  )}
                </Button>
              ) : null}
            </div>
            <div className="mt-4">
              <CommentMarkdown content={publication.summaryMarkdown} variant="document" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="mr-2 flex items-center gap-1 text-xs text-muted-foreground">
                <GitCommitHorizontal className="size-3.5" />
                {translate(
                  'auto.components.team.space.TaskResultsPanel.commits',
                  '{{value}} commits',
                  { value: publication.commitGitObjectIds.length }
                )}
              </span>
              {(artifacts[publication.id] ?? []).map((artifact) => (
                <Button
                  key={artifact.clientArtifactId}
                  variant="outline"
                  size="sm"
                  onClick={() => window.api.shell.openUrl(artifact.downloadUrl)}
                >
                  <Download /> {artifact.fileName}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

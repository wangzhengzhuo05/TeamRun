import { useState } from 'react'
import { MessageSquare, Send, UserRound } from 'lucide-react'
import type {
  OrganizationMember,
  Task,
  TaskComment,
  TaskStatus
} from '../../../../shared/teamrun-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { teamTaskStatusLabel } from './team-task-status-label'

type Props = {
  task: Task
  members: OrganizationMember[]
  comments: TaskComment[]
  onStatusChange: (status: TaskStatus) => Promise<void>
  onOwnerChange: (ownerUserId: string) => Promise<void>
  onComment: (bodyMarkdown: string) => Promise<void>
}

export function TaskConversationPanel({
  task,
  members,
  comments,
  onStatusChange,
  onOwnerChange,
  onComment
}: Props) {
  const [comment, setComment] = useState('')
  const submit = async () => {
    const body = comment.trim()
    if (!body) return
    await onComment(body)
    setComment('')
  }

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>#{task.number}</span>
              {task.externalSource ? (
                <Badge variant="outline">{task.externalSource.provider}</Badge>
              ) : null}
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{task.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select value={task.ownerUserId} onValueChange={onOwnerChange}>
              <SelectTrigger
                className="w-44"
                aria-label={translate(
                  'auto.components.team.space.TaskConversationPanel.ownerLabel',
                  'Task owner'
                )}
              >
                <UserRound className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={task.status}
              onValueChange={(value) => onStatusChange(value as TaskStatus)}
            >
              <SelectTrigger
                className="w-36"
                aria-label={translate(
                  'auto.components.team.space.TaskConversationPanel.statusLabel',
                  'Task status'
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['todo', 'in_progress', 'in_review', 'done', 'canceled'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {teamTaskStatusLabel(value)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        {task.externalSource ? (
          <Button
            variant="link"
            className="mt-2 h-auto p-0"
            onClick={() => window.api.shell.openUrl(task.externalSource?.url ?? '')}
          >
            {translate(
              'auto.components.team.space.TaskConversationPanel.ae0966a48c',
              'Open source issue'
            )}
          </Button>
        ) : null}
        <div className="mt-5 rounded-lg border border-border bg-card p-4">
          {task.descriptionMarkdown ? (
            <CommentMarkdown content={task.descriptionMarkdown} variant="document" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {translate(
                'auto.components.team.space.TaskConversationPanel.fd395cb122',
                'No description.'
              )}
            </p>
          )}
        </div>
        <div className="mt-6 flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {translate('auto.components.team.space.TaskConversationPanel.21c766a629', 'Discussion')}
          </h3>
          <Badge variant="secondary">{comments.length}</Badge>
        </div>
        <div className="mt-3 space-y-3">
          {comments.map((item) => (
            <article key={item.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </div>
              <CommentMarkdown content={item.bodyMarkdown} />
            </article>
          ))}
        </div>
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-card p-4">
          <Label htmlFor="teamrun-comment">
            {translate(
              'auto.components.team.space.TaskConversationPanel.85fb31812b',
              'Add comment'
            )}
          </Label>
          <Textarea
            id="teamrun-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!comment.trim()} onClick={submit}>
              <Send />{' '}
              {translate('auto.components.team.space.TaskConversationPanel.c011c9a39a', 'Comment')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

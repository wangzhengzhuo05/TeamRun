import { CheckCircle2, Circle, CircleDot, Eye, XCircle } from 'lucide-react'
import type { Task, TaskStatus } from '../../../../shared/teamrun-api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { teamTaskStatusLabel } from './team-task-status-label'

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'done') return <CheckCircle2 className="size-3.5" />
  if (status === 'in_review') return <Eye className="size-3.5" />
  if (status === 'in_progress') return <CircleDot className="size-3.5" />
  if (status === 'canceled') return <XCircle className="size-3.5" />
  return <Circle className="size-3.5" />
}

type Props = {
  tasks: Task[]
  selectedTaskId: string | null
  onSelect: (taskId: string) => void
}

export function TeamTaskList({ tasks, selectedTaskId, onSelect }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.team.space.TeamTaskList.2bb05cb6b3',
          'No tasks yet. Create one or import an external issue.'
        )}
      </div>
    )
  }

  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onSelect(task.id)}
          className={cn(
            'mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
            task.id === selectedTaskId
              ? 'border-primary/35 bg-accent text-accent-foreground'
              : 'border-transparent hover:border-border hover:bg-muted/50'
          )}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-muted-foreground">#{task.number}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Badge variant="outline" className="gap-1 font-normal">
              <StatusIcon status={task.status} /> {teamTaskStatusLabel(task.status)}
            </Badge>
            {task.externalSource ? (
              <span className="truncate text-xs text-muted-foreground">
                {task.externalSource.provider}
              </span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  )
}

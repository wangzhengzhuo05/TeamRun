import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { resolveSourceControlLaunchPlatform } from '@/lib/source-control-launch-platform'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../shared/tui-agent'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { translate } from '@/i18n/i18n'

export async function launchTeamRunFolderAgent(args: {
  folderWorkspaceId: string
  agent: TuiAgent
  agentCommandOverride?: string | null
  context: string
  onWorkspaceReady: (workspace: { id: string; path: string }) => void | Promise<void>
}): Promise<boolean> {
  const store = useAppStore.getState()
  const workspace = store.folderWorkspaces.find(
    (candidate) => candidate.id === args.folderWorkspaceId
  )
  if (!workspace) {
    return false
  }
  if (!isTuiAgentEnabled(args.agent, store.settings?.disabledTuiAgents)) {
    toast.error(
      translate(
        'auto.lib.teamrun.folder.agent.launch.66ee9d9956',
        'The selected agent is disabled on this device.'
      )
    )
    return false
  }
  const connectionId = workspace.connectionId?.trim() || null
  const detected = args.agentCommandOverride?.trim()
    ? null
    : connectionId
      ? await store.ensureRemoteDetectedAgents(connectionId)
      : workspace.executionHostId?.startsWith('runtime:')
        ? null
        : await store.ensureDetectedAgents()
  if (detected && !detected.includes(args.agent)) {
    toast.error(
      translate(
        'auto.lib.teamrun.folder.agent.launch.669a730e7e',
        'The selected agent is not available in this folder workspace.'
      )
    )
    return false
  }
  const preflight = TUI_AGENT_CONFIG[args.agent].preflightTrust
  if (preflight && !workspace.executionHostId?.startsWith('runtime:')) {
    await window.api.agentTrust
      ?.markTrusted({
        preset: preflight,
        workspacePath: workspace.folderPath,
        ...(connectionId ? { connectionId } : {})
      })
      .catch(() => undefined)
  }
  const workspaceId = folderWorkspaceKey(workspace.id)
  if (
    !activateAndRevealWorktree(workspaceId, {
      executionHostId: workspace.executionHostId ?? undefined
    })
  ) {
    return false
  }
  const launched = launchAgentInNewTab({
    agent: args.agent,
    agentCommandOverride: args.agentCommandOverride,
    worktreeId: workspaceId,
    prompt: args.context,
    promptDelivery: args.agent === 'generic-cli' ? 'auto-submit' : 'submit-after-ready',
    launchSource: 'task_page',
    launchPlatform: resolveSourceControlLaunchPlatform({
      connectionId,
      worktreePath: workspace.folderPath
    })
  })
  if (!launched) {
    return false
  }
  store.setSidebarOpen(true)
  await args.onWorkspaceReady({ id: workspaceId, path: workspace.folderPath })
  return true
}

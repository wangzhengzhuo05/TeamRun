import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Organization, Project, Repository, Task } from '../../../../shared/teamrun-api'
import type {
  TeamRunAuthStatus,
  TeamRunSignInArgs,
  TeamRunSyncStatus
} from '../../../../shared/teamrun-cloud'
import { translate } from '@/i18n/i18n'
import { normalizeTeamRunAuthStatus } from './teamrun-auth-status'

type TeamSpaceWorkspace = {
  auth: TeamRunAuthStatus | null
  loading: boolean
  organizations: Organization[]
  projects: Project[]
  repositories: Repository[]
  tasks: Task[]
  organizationId: string | null
  projectId: string | null
  taskId: string | null
  eventRevision: number
  syncStatus: TeamRunSyncStatus | null
  retrySync: () => Promise<void>
  signIn: (args: TeamRunSignInArgs) => Promise<void>
  signOut: () => Promise<void>
  selectOrganization: (id: string) => void
  selectProject: (id: string) => void
  selectTask: (id: string | null) => void
  createOrganization: (slug: string, name: string) => Promise<void>
  createProject: (key: string, name: string, contextMarkdown: string) => Promise<void>
  createRepository: (input: {
    provider: 'github' | 'gitlab' | 'other'
    remoteUrl: string
    displayName: string
    defaultBranch: string
  }) => Promise<void>
  createTask: (
    input: Parameters<typeof window.api.teamRun.tasks.create>[0]['task']
  ) => Promise<void>
  refreshTasks: () => Promise<void>
}

function reportError(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.team.space.useTeamSpaceWorkspace.e3e738a0bb',
          'TeamRun request failed'
        )
  )
}

export function useTeamSpaceWorkspace(): TeamSpaceWorkspace {
  const [auth, setAuth] = useState<TeamRunAuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [eventRevision, setEventRevision] = useState(0)
  const [syncStatus, setSyncStatus] = useState<TeamRunSyncStatus | null>(null)

  useEffect(() => {
    const removeStatusListener = window.api.teamRun.sync.onStatus(setSyncStatus)
    void window.api.teamRun.sync.status().then(setSyncStatus).catch(reportError)
    return removeStatusListener
  }, [])

  const loadOrganizations = useCallback(async () => {
    const next = await window.api.teamRun.organizations.list()
    setOrganizations(next)
    setOrganizationId((current) =>
      current && next.some((organization) => organization.id === current)
        ? current
        : (next[0]?.id ?? null)
    )
  }, [])

  useEffect(() => {
    let active = true
    void window.api.teamRun.auth
      .status()
      .then(async (value) => {
        if (!active) return
        const status = normalizeTeamRunAuthStatus(value)
        setAuth(status)
        if (status.state === 'signed-in') await loadOrganizations()
      })
      .catch(reportError)
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadOrganizations])

  useEffect(() => {
    setProjectId(null)
    setTaskId(null)
    setRepositories([])
    setTasks([])
    if (!organizationId || auth?.state !== 'signed-in') {
      setProjects([])
      return
    }
    let active = true
    void window.api.teamRun.projects
      .list(organizationId)
      .then((next) => {
        if (!active) return
        setProjects(next)
        setProjectId(next[0]?.id ?? null)
      })
      .catch(reportError)
    return () => {
      active = false
    }
  }, [auth?.state, organizationId])

  const refreshTasks = useCallback(async () => {
    if (!projectId) return
    const next = await window.api.teamRun.tasks.list(projectId)
    setTasks(next)
    setTaskId((current) => (current && next.some((task) => task.id === current) ? current : null))
  }, [projectId])

  const refreshProjects = useCallback(async () => {
    if (!organizationId) return
    const next = await window.api.teamRun.projects.list(organizationId)
    setProjects(next)
    setProjectId((current) =>
      current && next.some((project) => project.id === current) ? current : (next[0]?.id ?? null)
    )
  }, [organizationId])

  useEffect(() => {
    if (!organizationId || auth?.state !== 'signed-in') return
    const removeEventListener = window.api.teamRun.events.onEvent((event) => {
      if (event.organizationId !== organizationId) return
      setEventRevision((current) => current + 1)
      if (event.type.startsWith('project.')) void refreshProjects().catch(reportError)
      else void refreshTasks().catch(reportError)
    })
    void window.api.teamRun.events.start({ organizationId }).catch(reportError)
    return () => {
      removeEventListener()
      void window.api.teamRun.events.stop()
    }
  }, [auth?.state, organizationId, refreshProjects, refreshTasks])

  useEffect(() => {
    setTaskId(null)
    setTasks([])
    setRepositories([])
    if (!projectId) return
    let active = true
    void Promise.all([
      window.api.teamRun.tasks.list(projectId),
      window.api.teamRun.projects.listRepositories(projectId)
    ])
      .then(([nextTasks, nextRepositories]) => {
        if (!active) return
        setTasks(nextTasks)
        setRepositories(nextRepositories)
      })
      .catch(reportError)
    return () => {
      active = false
    }
  }, [projectId])

  const signIn = useCallback(
    async (args: TeamRunSignInArgs) => {
      try {
        setLoading(true)
        const status = normalizeTeamRunAuthStatus(await window.api.teamRun.auth.signIn(args))
        setAuth(status)
        if (status.state === 'signed-in') await loadOrganizations()
      } catch (error) {
        reportError(error)
      } finally {
        setLoading(false)
      }
    },
    [loadOrganizations]
  )

  const signOut = useCallback(async () => {
    setAuth(normalizeTeamRunAuthStatus(await window.api.teamRun.auth.signOut()))
    setOrganizations([])
    setOrganizationId(null)
  }, [])

  const retrySync = useCallback(async () => {
    setSyncStatus((current) => (current ? { ...current, connection: 'connecting' } : current))
    setSyncStatus(await window.api.teamRun.sync.flush())
  }, [])

  const createOrganization = useCallback(async (slug: string, name: string) => {
    const created = await window.api.teamRun.organizations.create({ slug, name })
    setOrganizations((current) => [...current, created])
    setOrganizationId(created.id)
  }, [])

  const createProject = useCallback(
    async (key: string, name: string, contextMarkdown: string) => {
      if (!organizationId) return
      const created = await window.api.teamRun.projects.create({
        organizationId,
        project: { key, name, contextMarkdown }
      })
      setProjects((current) => [...current, created])
      setProjectId(created.id)
    },
    [organizationId]
  )

  const createRepository = useCallback(
    async (input: Parameters<TeamSpaceWorkspace['createRepository']>[0]) => {
      if (!projectId) return
      const created = await window.api.teamRun.projects.createRepository({
        projectId,
        repository: input
      })
      setRepositories((current) => [...current, created])
    },
    [projectId]
  )

  const createTask = useCallback(
    async (input: Parameters<TeamSpaceWorkspace['createTask']>[0]) => {
      if (!projectId) return
      const created = await window.api.teamRun.tasks.create({ projectId, task: input })
      setTasks((current) => [created, ...current])
      setTaskId(created.id)
    },
    [projectId]
  )

  return {
    auth,
    loading,
    organizations,
    projects,
    repositories,
    tasks,
    organizationId,
    projectId,
    taskId,
    eventRevision,
    syncStatus,
    retrySync,
    signIn,
    signOut,
    selectOrganization: setOrganizationId,
    selectProject: setProjectId,
    selectTask: setTaskId,
    createOrganization,
    createProject,
    createRepository,
    createTask,
    refreshTasks
  }
}

import type {
  AgentRun,
  Channel,
  ChannelMessage,
  ContextSnapshot,
  CreateAgentRunRequest,
  CreateChannelMessageRequest,
  CreateChannelRequest,
  CreateContextSnapshotRequest,
  CreateModelConnectionRequest,
  CreateProjectRequest,
  CreateRepositoryRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  CreateTeamAgentRequest,
  CreateTeamFileRequest,
  CreateTeamFileProposalRequest,
  CreateTeamFileVersionRequest,
  CreatedTeamInviteCode,
  FinalizePublicationRequest,
  EnrollTeamServerRequest,
  ModelConnection,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  PreparedPublication,
  PreparePublicationRequest,
  PublicationArtifact,
  Project,
  Repository,
  ResultPublication,
  Task,
  TaskComment,
  TeamAgent,
  TeamEvent,
  TeamFile,
  TeamFileProposal,
  TeamFileVersion,
  TeamFileVersionContent,
  TeamInviteCode,
  TeamServerBinding,
  UpdateAgentRunStatusRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  VerificationResult
} from '../../shared/teamrun-api'
import type {
  TeamRunAuthStatus,
  TeamRunSignInArgs,
  TeamRunSyncStatus,
  TeamRunWorkspaceReview
} from '../../shared/teamrun-cloud'
import type { TeamRunWorkspaceRecord } from '../../shared/teamrun-cloud'
import type { TeamRunVerificationCommand } from '../../shared/orca-yaml-hook-types'

export type TeamRunApi = {
  auth: {
    status: () => Promise<TeamRunAuthStatus>
    signIn: (args?: TeamRunSignInArgs) => Promise<TeamRunAuthStatus>
    signOut: () => Promise<TeamRunAuthStatus>
  }
  sync: {
    status: () => Promise<TeamRunSyncStatus>
    flush: () => Promise<TeamRunSyncStatus>
    onStatus: (listener: (status: TeamRunSyncStatus) => void) => () => void
  }
  organizations: {
    list: () => Promise<Organization[]>
    create: (args: { slug: string; name: string }) => Promise<Organization>
    listMembers: (organizationId: string) => Promise<OrganizationMember[]>
    addMember: (args: {
      organizationId: string
      email: string
      role: 'admin' | 'member'
    }) => Promise<OrganizationMember>
    removeMember: (args: { organizationId: string; userId: string }) => Promise<void>
    updateMemberRole: (args: {
      organizationId: string
      userId: string
      role: 'admin' | 'member'
    }) => Promise<void>
    listInviteCodes: (organizationId: string) => Promise<TeamInviteCode[]>
    createInviteCode: (organizationId: string) => Promise<CreatedTeamInviteCode>
    revokeInviteCode: (args: { organizationId: string; inviteCodeId: string }) => Promise<void>
    redeemInviteCode: (code: string) => Promise<Organization>
    listInvitations: (organizationId: string) => Promise<OrganizationInvitation[]>
    invite: (args: {
      organizationId: string
      email: string
      role: 'admin' | 'member'
    }) => Promise<OrganizationInvitation>
    revokeInvitation: (args: { organizationId: string; invitationId: string }) => Promise<void>
  }
  projects: {
    list: (organizationId: string) => Promise<Project[]>
    create: (args: { organizationId: string; project: CreateProjectRequest }) => Promise<Project>
    update: (args: { projectId: string; changes: UpdateProjectRequest }) => Promise<Project>
    listRepositories: (projectId: string) => Promise<Repository[]>
    createRepository: (args: {
      projectId: string
      repository: CreateRepositoryRequest
    }) => Promise<Repository>
  }
  collaboration: {
    listChannels: (projectId: string) => Promise<Channel[]>
    createChannel: (args: { projectId: string; channel: CreateChannelRequest }) => Promise<Channel>
    listMessages: (channelId: string) => Promise<ChannelMessage[]>
    createMessage: (args: {
      channelId: string
      message: CreateChannelMessageRequest
    }) => Promise<ChannelMessage>
    listTeamAgents: (projectId: string) => Promise<TeamAgent[]>
    createTeamAgent: (args: {
      projectId: string
      teamAgent: CreateTeamAgentRequest
    }) => Promise<TeamAgent>
    getTeamServer: (projectId: string) => Promise<TeamServerBinding | null>
    enrollTeamServer: (args: {
      projectId: string
      teamServer: EnrollTeamServerRequest
    }) => Promise<TeamServerBinding>
    listModelConnections: (projectId: string) => Promise<ModelConnection[]>
    createModelConnection: (args: {
      projectId: string
      connection: CreateModelConnectionRequest
    }) => Promise<ModelConnection>
    reply: (args: {
      projectId: string
      channelId: string
      teamAgentId: string
      bodyMarkdown: string
    }) => Promise<ChannelMessage>
  }
  files: {
    list: (projectId: string) => Promise<TeamFile[]>
    create: (args: { projectId: string; file: CreateTeamFileRequest }) => Promise<TeamFile>
    listVersions: (teamFileId: string) => Promise<TeamFileVersion[]>
    readVersion: (versionId: string) => Promise<TeamFileVersionContent>
    createVersion: (args: {
      teamFileId: string
      version: CreateTeamFileVersionRequest
    }) => Promise<TeamFileVersion>
    listProposals: (teamFileId: string) => Promise<TeamFileProposal[]>
    requestProposal: (args: {
      teamFileId: string
      proposal: CreateTeamFileProposalRequest
    }) => Promise<TeamFileProposal>
    applyProposal: (proposalId: string) => Promise<TeamFileVersion>
    clearQuarantine: (versionId: string) => Promise<TeamFileVersion>
    delete: (teamFileId: string) => Promise<void>
  }
  tasks: {
    list: (projectId: string) => Promise<Task[]>
    get: (taskId: string) => Promise<Task>
    create: (args: { projectId: string; task: CreateTaskRequest }) => Promise<Task>
    update: (args: { taskId: string; changes: UpdateTaskRequest }) => Promise<Task>
    listComments: (taskId: string) => Promise<TaskComment[]>
    createComment: (args: {
      taskId: string
      comment: CreateTaskCommentRequest
    }) => Promise<TaskComment>
    listSnapshots: (taskId: string) => Promise<ContextSnapshot[]>
    createSnapshot: (args: {
      taskId: string
      snapshot: CreateContextSnapshotRequest
    }) => Promise<ContextSnapshot>
  }
  runs: {
    list: (taskId: string) => Promise<AgentRun[]>
    create: (args: { taskId: string; run: CreateAgentRunRequest }) => Promise<AgentRun>
    createLinked: (args: {
      taskId: string
      run: CreateAgentRunRequest
      workspaceId: string
      workspacePath: string
    }) => Promise<AgentRun>
    resolveWorkspace: (clientRunId: string) => Promise<TeamRunWorkspaceRecord | null>
    reviewWorkspace: (args: {
      runId: string
      clientRunId: string
    }) => Promise<TeamRunWorkspaceReview>
    updateStatus: (args: {
      runId: string
      status: UpdateAgentRunStatusRequest
    }) => Promise<AgentRun>
    listVerifications: (runId: string) => Promise<VerificationResult[]>
    listVerificationCommands: (clientRunId: string) => Promise<TeamRunVerificationCommand[]>
    runVerification: (args: {
      runId: string
      clientRunId: string
      commandId: string
    }) => Promise<VerificationResult>
  }
  publications: {
    list: (taskId: string) => Promise<ResultPublication[]>
    listArtifacts: (publicationId: string) => Promise<PublicationArtifact[]>
    prepare: (request: PreparePublicationRequest) => Promise<PreparedPublication>
    finalize: (args: {
      publicationId: string
      request: FinalizePublicationRequest
    }) => Promise<ResultPublication>
    publishSelected: (args: {
      runId: string
      clientRunId: string
      summaryMarkdown: string
      reviewUrl?: string | null
      includeDiff: boolean
      includeVerificationOutput: boolean
    }) => Promise<ResultPublication>
  }
  events: {
    start: (args: { organizationId: string; cursor?: number }) => Promise<void>
    stop: () => Promise<void>
    onEvent: (listener: (event: TeamEvent) => void) => () => void
    onError: (listener: (message: string) => void) => () => void
  }
}

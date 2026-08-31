# TeamRun Collaboration

TeamRun Collaboration describes how teams coordinate shared projects, tasks, files, and reusable agents while members keep unfinished workspace activity private.

## Collaboration spaces

**Team Space**:
The shared product area for team conversations, tasks, files, and administration.
_Avoid_: Organization workspace

**Personal Space**:
The existing user-private product area for projects, external work items, workspaces, and agent activity.
_Avoid_: Team Space

**Team**:
A group of members in Team Space that serves one Team Project.
_Avoid_: Organization, workspace

**Team Project**:
The shared project context, repository metadata, and flat task collection owned one-to-one by a Team. It is not a directory on a member's machine.
_Avoid_: Workspace, checkout, local project

**Primary Repository**:
The first code repository bound to a Team Project and used for its initial task and pull-request workflow. A Team Project may support additional repositories later.
_Avoid_: Personal Workspace, Team Files

**Personal Workspace**:
A Git worktree or folder on a member's local machine, SSH host, or paired runtime where private work is performed.
_Avoid_: Team Project, Team workspace

**Personal Project**:
The existing Personal Space projection that groups a member's related repository checkouts across execution hosts.
_Avoid_: Team Project

**Project Setup**:
A concrete local, SSH, or paired-runtime checkout through which a Personal Project can create or open a Personal Workspace.
_Avoid_: Team Server, Team Project

## Work

**Team Task**:
A shared unit of work split directly from a Team Project that one member can claim, open through the existing Personal Space work-item flow, and complete through one primary Published Result. It remains authoritative even when linked to an External Work Item.
_Avoid_: Personal task, worktree

**External Work Item**:
A GitHub, GitLab, Linear, or Jira issue displayed in Personal Space while its external provider remains authoritative.
_Avoid_: Team Task, Personal Task

**Workspace Link**:
The device-private association between a Team Task or External Work Item and a Personal Workspace opened to work on it. One Team Task may have multiple Workspace Links without exposing them or their paths to the Team.
_Avoid_: Personal Task

**Agent Run**:
One execution of an agent against a frozen task context in a specific Personal Workspace or on a Team Server.
_Avoid_: Team Agent, agent identity

**Published Result**:
The result explicitly shared from private work or a Team Server Agent Run back to the Team, commonly as a pull request.
_Avoid_: Workspace state, private draft

## Agents and execution

**Team Agent**:
A reusable agent identity registered with a Team and available to authorized Team members. A Team Agent has a defined specialization and is distinct from any individual Agent Run.
_Avoid_: Agent Run, personal agent

**Recorder Agent**:
A Team Agent specialized in reading Team conversations and producing shared notes or summaries without executing code.

**Developer Agent**:
A Team Agent specialized in working on Team Tasks in an isolated Team Server workspace. Starting its development work is restricted to Owners and Admins.

**Development Run**:
A Developer Agent's code-changing Agent Run, always tied to a Team Task, frozen context, and accountable Owner or Admin.
_Avoid_: Unscoped agent prompt

**Documentation Action**:
A Team Agent operation that answers a member's question or edits shared Team documentation without performing code-development work.
_Avoid_: Developer Agent Run

**Documentation Proposal**:
A candidate Team Document version produced by a Team Agent that becomes current only after the requesting member confirms it.
_Avoid_: Direct document overwrite

**Model Connection**:
A reusable Team Server configuration containing an OpenAI-compatible Base URL, API key, and explicit model that one or more Team Agents can reference.
_Avoid_: Team Agent, provider identity

**Team Server**:
The Team-owned, paired Linux runtime on which the Team's shared Team Agents run in isolated workspaces.
_Avoid_: Personal Workspace, personal SSH host, relay

**YOLO Mode**:
An Owner-controlled Team Agent policy that skips interactive permission requests without bypassing Team permissions, quarantine boundaries, secret protection, or Team-visible activity records.
_Avoid_: Hidden execution, unrestricted Team access

## Shared files

**Team Files**:
The Team-owned, versioned file library for shared documents, reference code, and other uploaded files. It is not an executable cloud source workspace.
_Avoid_: Git repository, Personal Workspace, cloud IDE

**Team Document**:
A versioned Markdown document in Team Files that authorized members and Team Agents can edit online.
_Avoid_: Repository source file

**File Version**:
An immutable revision of a Team File. Agent Runs and Team Tasks reference exact File Versions rather than mutable file names.

**Context Enrichment**:
The default pre-run process in which a member and a Team Agent select relevant File Versions before the Agent Run context is frozen. Agent-selected material and its provenance remain Team-visible.
_Avoid_: Hidden file access

**Team Memory**:
Long-lived Agent knowledge captured as a Team Document that members can inspect, correct, version, or delete.
_Avoid_: Hidden agent memory

**Quarantined File**:
A Team File suspected of containing malware or secrets that remains excluded from preview and Agent context until explicitly cleared.

## Code collaboration

**Code Provider Identity**:
The Team-installed bot or application identity used by Team Server Agent Runs to create branches and pull requests while preserving attribution to the initiating member and Team Agent.
_Avoid_: Member personal access token

## Membership

**Owner**:
The Team member accountable for membership, roles, and Team Agent governance.

**Admin**:
A Team member responsible for Team Project, repository, task administration, and starting Development Runs without membership or Team Agent configuration governance.

**Member**:
A Team participant who can collaborate, claim tasks, ask Team Agents questions, and request Documentation Actions without starting Development Runs.

## Visibility

**Team Activity**:
An event performed within a Team whose state is visible to every Team member.
_Avoid_: Private Team event

**Private Work**:
Work performed in a Personal Workspace that is visible only to its member until a Published Result is explicitly shared with the Team.
_Avoid_: Team Activity

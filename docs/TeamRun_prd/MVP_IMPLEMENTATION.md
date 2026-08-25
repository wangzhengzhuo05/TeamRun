# TeamRun MVP implementation

This document is the delivery and operations companion to
[`prd_20260823_v0.1.md`](./prd_20260823_v0.1.md).

## Delivered scope

The MVP implements the PRD's primary flow:

```text
Team Task → immutable context snapshot → personal workspace
          → one or more Agent runs → local verification and comparison
          → human review → explicit publication → Team Space results
```

Team Space includes organizations, members and invitations, projects,
repositories, tasks and imported tasks, comments, channels, reusable Team
Agents, context snapshots, run status, and published results. Personal
Workspace supports Git worktrees and folder workspaces on native, direct SSH,
and capability-negotiated remote runtimes.

Task owners are selected from organization members. Team Agents can use a
built-in Agent preset or a Generic CLI command. Generic commands receive the
frozen task context as their final argument, remain visible before launch, and
require an explicit trust confirmation for the selected execution host.

The server is split into two workspace packages:

- `@teamrun/contracts`: versioned Zod request, response, event, and publication contracts.
- `@teamrun/api`: Fastify, PostgreSQL/Drizzle, OIDC, durable events, and S3-compatible publication storage.

The desktop keeps TeamRun's internal wire and engine identifiers where changing
them would break mixed-version clients. Public application, CLI, protocol,
package, and installer identity is TeamRun.

## Local development

Requirements are Node.js 24, pnpm through Corepack, and Docker Compose (or
compatible PostgreSQL 17 and S3 services).

Start the local dependencies:

```bash
docker compose -f config/teamrun/compose.yaml up -d
```

Build contracts, apply all migrations, and start the API:

```bash
corepack pnpm install
corepack pnpm teamrun:build
corepack pnpm teamrun:db:migrate
corepack pnpm teamrun:dev
```

The root TeamRun development scripts load
`config/teamrun/development.env.example`. Existing process environment values
take precedence, so a different database or object store can be supplied
without editing the example file. In development the API creates the MinIO
bucket on first startup.

Start the desktop in another shell.

macOS/Linux:

```bash
TEAMRUN_API_URL=http://127.0.0.1:4310 TEAMRUN_DEV_AUTH=1 corepack pnpm dev
```

PowerShell:

```powershell
$env:TEAMRUN_API_URL = 'http://127.0.0.1:4310'
$env:TEAMRUN_DEV_AUTH = '1'
corepack pnpm dev
```

Open Team Space, enter a development email, then create an organization,
project, repository, and task. `GET http://127.0.0.1:4310/health` checks API and
database readiness. MinIO's local console is available at
`http://127.0.0.1:9001`.

## Production configuration

Run migrations before starting `@teamrun/api`. Production must set:

- `NODE_ENV=production`, `HOST`, `PORT`, `DATABASE_URL`, and `TEAMRUN_PUBLIC_URL`.
- `TEAMRUN_OIDC_ISSUER`, `TEAMRUN_OIDC_AUDIENCE`, and `TEAMRUN_OIDC_CLIENT_ID`.
- `TEAMRUN_CORS_ORIGINS` as the exact comma-separated allowed origins.
- `TEAMRUN_S3_ENDPOINT`, region, bucket, access key, and secret key.
- `TEAMRUN_DEV_AUTH=0`.

The S3 bucket must exist before a production API starts. The OIDC client must
be public, require Authorization Code with PKCE S256, allow refresh tokens, and
permit loopback redirects matching `http://127.0.0.1:*/auth/callback`. Tokens
must use the configured issuer and audience and include `sub` and `email`;
tokens explicitly marking the email unverified are rejected.

Packaged desktops require `TEAMRUN_API_URL` to be supplied by the deployment
environment. OIDC and S3 endpoints should use TLS outside local development.

## Privacy and synchronization boundary

Private by default is enforced at the client boundary:

- workspace paths, prompts, uncommitted files, diffs, and verification output stay local;
- frozen task context and run metadata are shared with Team Space;
- only artifacts selected in the Publish dialog are uploaded;
- the selected workspace diff can include committed, staged, unstaged, and
  untracked changes from the frozen base revision, with a 5 MiB limit;
- result downloads use short-lived signed URLs that are not written to the offline cache;
- session tokens use Electron `safeStorage`; development plaintext sessions are disabled in packaged builds;
- response cache, mutation outbox, workspace links, and local verification data are scoped to API and signed-in identity.

Offline reads use the last identity-scoped response. Supported writes enter an
ordered, idempotent outbox. A conflict blocks later writes instead of
reordering them; the Team Space sync badge exposes the pending and blocked
state for manual retry.

## Compatibility contract

Remote workspace operations advertise
`teamrun.workspace-operations.v1`. New clients fall back safely when an older
runtime does not advertise it. Existing TeamRun protocol names remain intact for
mixed-version compatibility. Git operations retain the Git 2.25 baseline, and
workspace execution resolves native, folder, direct SSH, and remote runtime
hosts at runtime rather than assuming a local Git worktree.

Generic CLI commands use the existing terminal-create wire path instead of a
new remote Agent enum, so older paired hosts can execute the fully quoted
command without needing to understand TeamRun-specific Agent metadata.

## Verification and packaging

Run the focused gates from the repository root:

```bash
corepack pnpm teamrun:build
corepack pnpm teamrun:test
corepack pnpm check:max-lines-ratchet
corepack pnpm verify:localization-catalog
corepack pnpm verify:localization-extraction
corepack pnpm verify:localization-coverage
corepack pnpm build:relay
corepack pnpm build:cli
corepack pnpm build:electron-vite
```

Linux packages are built with:

```bash
corepack pnpm exec electron-builder --config config/electron-builder.config.cjs --linux AppImage deb
```

The packaging gate checks bundled native binaries against the Ubuntu 20.04 /
glibc 2.31 floor. Rendered UI checks must use the repository's Electron skill
and Playwright CDP workflow.

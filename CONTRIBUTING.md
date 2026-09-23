# Contributing to Linea

Thanks for your interest in contributing. This guide covers setup,
conventions, and the PR process.

Coding rules (comments, formatting, error handling, TypeScript, etc.) live in
[AGENTS.md](AGENTS.md) — read that too before opening a PR.

## Prerequisites

- **Node.js** 20+
- **pnpm** 10 — `npm install -g pnpm@10`
- **Docker** (for Postgres and Redis)

## First-time setup

### 1. Clone and install

```bash
git clone https://github.com/linea-org/linea.git
cd linea
pnpm install
```

### 2. Start Postgres and Redis

```bash
pnpm db:up
pnpm queue:up
```

`db:up` starts Postgres 16 with the `pgvector` extension on port `5432`;
`queue:up` starts Redis on port `6379` — both via Docker Compose. Data
persists in named volumes across restarts. `pnpm db:down` or
`pnpm queue:down` stops the whole Compose stack (both services); `db:logs`
/ `queue:logs` tail one service's logs.

### 3. Configure environment variables

```bash
cp .env.example .env
```

There's a single `.env` at the repo root shared by the local apps and workers.
Fill in:

| Variable                                                                | Required | Purpose                                                                                                     |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                          | Yes      | Defaults to the local Docker Postgres instance                                                              |
| `REDIS_URL`                                                             | Yes      | Defaults to the local Docker Redis instance                                                                 |
| `BETTER_AUTH_SECRET`                                                    | Yes      | Long random secret for workspace authentication                                                             |
| `BETTER_AUTH_URL`                                                       | Yes      | Defaults to `http://localhost:3001`                                                                         |
| `APP_URL` / `TRUSTED_ORIGINS`                                           | No       | Public application origin and additional trusted origins                                                    |
| `SECRETS_ENCRYPTION_KEY`                                                | Yes      | Base64-encoded 32-byte AES key for workspace secrets                                                        |
| `CONNECTION_CREDENTIAL_ACTIVE_KEY`                                      | Yes      | Active version in the Connection credential key ring                                                        |
| `CONNECTION_CREDENTIAL_KEYS`                                            | Yes      | JSON object mapping Connection key versions to base64-encoded 32-byte AES keys                              |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `XAI_API_KEY` | No       | Required only for live calls to the corresponding AI provider                                               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                             | No       | better-auth Google sign-in registration                                                                     |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                             | No       | better-auth GitHub sign-in registration                                                                     |
| `GOOGLE_CONNECTOR_CLIENT_ID` / `GOOGLE_CONNECTOR_CLIENT_SECRET`         | No       | Linea-owned Google Connection registration for Gmail and Calendar                                           |
| `VITE_API_URL` / `VITE_APP_URL`                                         | No       | Browser API and application origins; local defaults are `http://localhost:3000` and `http://localhost:3001` |
| `RESEND_API_KEY` / `EMAIL_FROM`                                         | Yes      | Auth and invitation email delivery                                                                          |
| `EMAIL_BRAND_NAME` / `EMAIL_SUPPORT_EMAIL`                              | No       | Email presentation metadata                                                                                 |

The values committed in `.env.example` are development placeholders. Generate
real encryption keys before storing any non-test secret or Connection.

### 4. Push the database schema

```bash
pnpm db:migrate
```

Applies the existing migrations in `packages/db/drizzle/` to your local
Postgres.

### 5. Start the dev servers

```bash
pnpm dev
```

| App                  | URL                             |
| -------------------- | ------------------------------- |
| Web (TanStack Start) | http://localhost:3001           |
| API (NestJS)         | http://localhost:3000           |
| API health check     | http://localhost:3000/v1/health |

## Project structure

```text
linea/
├── apps/
│   ├── web/                # workspace dashboard and workflow builder
│   ├── platform-api/       # workspace and public /v1 HTTP interfaces
│   ├── execution-worker/   # graph execution, checkpoints, replay, connectors
│   ├── background-worker/  # schedules, outbox delivery, notifications, analysis
│   ├── mobile/             # Expo operator monitoring and approvals
│   ├── docs/               # Next.js and Fumadocs documentation site
│   └── run-gateway/        # reserved scaffold for future sandbox execution
└── packages/
    ├── protocol/           # public resources, operations, events, and errors
    ├── sdk/                # server, End-User, and webhook TypeScript clients
    ├── sdk-react/          # headless React hooks and CopilotKit adapter
    ├── runtime/            # workflow schemas, node registry, graph interpreter
    ├── connectors/         # Connector Gateway and Google/GitHub operations
    ├── ai/                 # provider registry, adapters, key resolution, pricing
    ├── db/                 # Drizzle schemas, repositories, encryption, migrations
    ├── queue/              # BullMQ queues and dispatch contracts
    ├── auth/               # better-auth configuration and email delivery
    ├── ui/                 # shared React primitives and design tokens
    ├── config/             # shared lint and TypeScript configuration
    ├── types/              # shared internal TypeScript types
    └── sandbox-provider/   # reserved scaffold for future sandbox implementations
```

Apps never import from one another. Shared contracts and behavior belong in
`packages/*`. The browser imports `@linea/runtime/browser`; server-only graph
execution remains in the full runtime package and workers.

See [docs/repo-structure.md](docs/repo-structure.md) for current ownership and
dependency rules, [docs/roadmap.md](docs/roadmap.md) for strategic sequencing,
[docs/execution-architecture.md](docs/execution-architecture.md) for the
execution data model, and
[docs/documentation-strategy.md](docs/documentation-strategy.md) for how
documentation itself is organized as the product grows.

## Common commands

```bash
# Development
pnpm dev                  # start all apps in dev mode
pnpm build                # production build of all apps/packages
pnpm demo                 # run the example workflow end to end (needs pnpm dev running)

# Code quality (same checks CI runs)
pnpm lint                 # eslint across all packages
pnpm typecheck            # tsc --noEmit across all packages
pnpm format               # prettier --write across all packages
pnpm format:check         # prettier --check (non-mutating, what CI runs)
pnpm test                 # test suites across all packages
pnpm check:contracts      # verify generated public contracts are current
pnpm test:launch          # first external-subject approval launch gate
pnpm test:connections-launch # Connections and Action Consent launch gate
pnpm test:connections-smoke  # optional live Google/GitHub provider smoke tests

# Database
pnpm db:up                # start Postgres via Docker
pnpm db:down              # stop Postgres
pnpm db:logs              # tail Postgres logs
pnpm db:generate          # generate a migration file from a schema diff
pnpm db:migrate           # apply migrations to your local DB
pnpm db:studio            # open Drizzle Studio

# Queue
pnpm queue:up             # start Redis via Docker
pnpm queue:down           # stop the Docker Compose stack (Postgres + Redis)
pnpm queue:logs           # tail Redis logs
```

`pnpm test` already runs a real crash-and-resume integration test
(`apps/execution-worker/src/runs/crash-and-resume.spec.ts`) against a live Postgres
— that's why `db:up` matters even if you're "just running tests," and why CI's
`test` job spins up real Postgres and Redis services rather than mocking them.

## Making schema changes

1. Edit the relevant file in `packages/db/src/schema/`
2. Run `pnpm db:generate` to produce a migration file
3. Run `pnpm db:migrate` to apply it locally
4. Commit the generated migration file alongside your schema change

## Pull request guidelines

- One branch per issue: `fix/<slug>` or `feat/<slug>`
- Keep PRs focused — one concern per PR
- Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm test`
  before opening (this is exactly what CI checks)
- Schema changes must include a generated migration file
- Don't commit `.env` — it's gitignored by design
- No AI-assistant co-authorship lines in commit messages

### PR title format

`<type>(<scope>): <summary>` — this becomes the squash-merge commit message
on `main`, so it's what shows up in `git log` for anyone bisecting or
writing release notes later.

**Type** (required):

| Type       | Use for                                                |
| ---------- | ------------------------------------------------------ |
| `feat`     | A new feature or capability                            |
| `fix`      | A bug fix                                              |
| `chore`    | Dependency bumps, config, tooling — no behavior change |
| `docs`     | Documentation only                                     |
| `refactor` | Code restructuring with no behavior change             |
| `test`     | Adding or fixing tests only, no production code change |
| `perf`     | A performance improvement                              |

**Scope** (optional, but preferred): the directory name of whichever app
under `apps/` or package under `packages/` the PR mostly touches (see
[Project structure](#project-structure) above) — e.g. `execution-worker`,
`platform-api`, `web`, `db`. Not a fixed list: any current directory name
is a valid scope, and a repo's `area:` labels track the same set. Omit the
scope for a PR that's genuinely repo-wide (tooling, CI, root config).

**Summary**: lowercase, imperative mood ("add", not "added" or "adds"),
no trailing period.

Examples:

```
feat(execution-worker): add Wait node for pausing on a timer
fix(platform-api): pin chat conversation subject to its first turn
chore(db): squash migration chain after parallel-branch merge
docs: document PR title conventions
```

A breaking change gets a `!` after the type/scope, e.g.
`feat(runtime)!: drop the deprecated \`legacyConfig\` field` — call out
what breaks and how to migrate in the PR description.

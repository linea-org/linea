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

There's a single `.env` at the repo root shared by both apps. Fill in:

| Variable                                                                | Required | Where to get it                                                                                  |
| ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                          | Yes      | Defaults to the Docker Postgres above, no change needed locally                                  |
| `REDIS_URL`                                                             | Yes      | Defaults to the Docker Redis above, no change needed locally                                     |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `XAI_API_KEY` | No       | Only needed to actually call that provider's models via an AI node — see `packages/ai/MODULE.md` |
| `BETTER_AUTH_SECRET`                                                    | Yes      | Any long random string, e.g. `openssl rand -hex 32`                                              |
| `BETTER_AUTH_URL`                                                       | Yes      | Defaults to `http://localhost:3001`, no change needed locally                                    |
| `APP_URL`                                                               | No       | Falls back to `BETTER_AUTH_URL` if unset                                                         |
| `TRUSTED_ORIGINS`                                                       | No       | Falls back to `APP_URL`/`BETTER_AUTH_URL` if unset                                               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                             | No       | Google Cloud Console, only needed to test Google OAuth                                           |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                             | No       | GitHub OAuth Apps, only needed to test GitHub OAuth                                              |
| `VITE_API_URL`                                                          | No       | Falls back to `http://localhost:3000` if unset                                                   |
| `VITE_APP_URL`                                                          | No       | Falls back to `http://localhost:3001` if unset                                                   |
| `RESEND_API_KEY`                                                        | Yes      | [Resend](https://resend.com) dashboard, needed for any auth email (verification, reset, invites) |
| `EMAIL_FROM`                                                            | Yes      | The `From` address auth emails send from                                                         |
| `EMAIL_BRAND_NAME`                                                      | No       | Falls back to `"Linea"` if unset                                                                 |
| `EMAIL_SUPPORT_EMAIL`                                                   | No       | Omitted from email footers if unset                                                              |

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

| App                  | URL                          |
| -------------------- | ---------------------------- |
| Web (TanStack Start) | http://localhost:3001        |
| API (NestJS)         | http://localhost:3000        |
| API health check     | http://localhost:3000/health |

## Project structure

```
linea/
├── apps/
│   ├── platform-api/       # NestJS backend
│   │   └── src/
│   │       ├── health/     # liveness check
│   │       └── me/         # current-user endpoint
│   ├── web/                # TanStack Start frontend
│   │   └── src/
│   │       ├── components/ # auth + workspace UI
│   │       └── routes/     # file-based routes
│   ├── execution-worker/   # workflow execution runtime — nodes, interpreter, checkpoints
│   ├── background-worker/  # schedule firing
│   └── run-gateway/        # stub, not yet built
└── packages/
    ├── auth/             # better-auth config, email sending
    ├── db/               # Drizzle schema, client, repositories, migrations
    ├── ui/               # shared React component library (shadcn)
    ├── config/           # shared eslint config + tsconfig base
    ├── types/            # shared TypeScript types
    ├── ai/               # provider registry + key resolver (Anthropic, OpenAI, Groq, xAI)
    ├── runtime/          # workflow JSON schema, node registry, graph walker
    ├── queue/            # BullMQ wrapper — workflow-execution queue
    ├── connectors/       # stub, not yet built
    ├── sandbox-provider/ # stub, not yet built
    ├── sdk/              # stub, not yet built
    └── sdk-react/        # stub, not yet built
```

A "stub" is just a `package.json`, no `src/` yet. "Scaffolded" has lint/tsconfig
wiring and placeholder folders but no real implementation. Check before
assuming functionality exists — this list drifts as work lands; if you notice
it's wrong, fix it in the same PR.

See [docs/roadmap.md](docs/roadmap.md) for what's planned in each of these,
[docs/execution-architecture.md](docs/execution-architecture.md) for
`packages/db`'s schema in detail, and
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

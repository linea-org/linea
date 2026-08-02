# Contributing to Linea

Thanks for your interest in contributing. This guide covers setup,
conventions, and the PR process.

Coding rules (comments, formatting, error handling, TypeScript, etc.) live in
[AGENTS.md](AGENTS.md) — read that too before opening a PR.

## Prerequisites

- **Node.js** 20+
- **pnpm** 10 — `npm install -g pnpm@10`
- **Docker** (for Postgres)

## First-time setup

### 1. Clone and install

```bash
git clone https://github.com/linea-org/linea.git
cd linea
pnpm install
```

### 2. Start Postgres

```bash
pnpm db:up
```

This starts Postgres 16 with the `pgvector` extension on port `5432` via
Docker Compose. Data persists in a named volume across restarts. Use
`pnpm db:down` to stop it and `pnpm db:logs` to tail its logs.

### 3. Configure environment variables

```bash
cp .env.example .env
```

There's a single `.env` at the repo root shared by both apps. Fill in:

| Variable                                                  | Required | Where to get it                                                                                  |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                            | Yes      | Defaults to the Docker Postgres above, no change needed locally                                  |
| `BETTER_AUTH_SECRET`                                      | Yes      | Any long random string, e.g. `openssl rand -hex 32`                                              |
| `BETTER_AUTH_URL` / `APP_URL`                             | Yes      | Defaults to `http://localhost:3001`, no change needed locally                                    |
| `TRUSTED_ORIGINS`                                         | Yes      | Defaults are fine locally                                                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`               | No       | Google Cloud Console, only needed to test Google OAuth                                           |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`               | No       | GitHub OAuth Apps, only needed to test GitHub OAuth                                              |
| `VITE_API_URL` / `VITE_APP_URL`                           | Yes      | Defaults are fine locally                                                                        |
| `RESEND_API_KEY`                                          | Yes      | [Resend](https://resend.com) dashboard, needed for any auth email (verification, reset, invites) |
| `EMAIL_FROM` / `EMAIL_BRAND_NAME` / `EMAIL_SUPPORT_EMAIL` | Yes      | Defaults are fine locally                                                                        |

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
│   ├── background-worker/  # scaffolded, not yet built
│   ├── execution-worker/   # scaffolded, not yet built
│   └── run-gateway/        # scaffolded, not yet built
└── packages/
    ├── auth/       # better-auth config, email sending
    ├── db/         # Drizzle schema, client, migrations
    ├── ui/         # shared React component library (shadcn)
    ├── ai/         # AI provider integration (in progress)
    ├── config/     # shared eslint config + tsconfig base
    └── types/      # shared TypeScript types
```

Some `apps/*` and `packages/*` are stubs (just a `package.json`, no `src/`
yet) — check before assuming functionality exists.

## Common commands

```bash
# Development
pnpm dev                  # start all apps in dev mode
pnpm build                # production build of all apps/packages

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
```

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

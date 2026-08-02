# Linea

Linea is an AI workflow orchestration platform: build, run, and manage
automations that combine AI models, tools, and integrations.

**Status: early and under active development.** The monorepo's foundations
(auth, workspace onboarding, role-based access) are in place; the workflow
builder and execution engine are being built out. Expect gaps and breaking
changes. If you're looking for a finished product, this isn't it yet — if
you'd like to help build one, contributions are welcome.

## Stack

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Frontend | TanStack Start, React 19, Tailwind CSS, shadcn/ui  |
| Backend  | NestJS                                             |
| Database | PostgreSQL (pgvector), Drizzle ORM                 |
| Auth     | better-auth (email/password + Google/GitHub OAuth) |
| Email    | Resend                                             |
| Monorepo | pnpm workspaces + Turborepo                        |

## Quick start

**Prerequisites:** Node.js 20+, pnpm 10+, Docker

```bash
# 1. Install
pnpm install

# 2. Start Postgres
pnpm db:up

# 3. Configure environment
cp .env.example .env
# fill in BETTER_AUTH_SECRET, RESEND_API_KEY, and (optionally) OAuth keys

# 4. Push the database schema
pnpm db:migrate

# 5. Start the apps
pnpm dev
```

| App              | URL                          |
| ---------------- | ---------------------------- |
| Web              | http://localhost:3001        |
| API (NestJS)     | http://localhost:3000        |
| API health check | http://localhost:3000/health |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup guide, project
layout, and environment variable reference.

## Monorepo layout

```
linea/
├── apps/
│   ├── platform-api/       # NestJS backend
│   ├── web/                # TanStack Start frontend
│   ├── background-worker/  # not yet built
│   ├── execution-worker/   # not yet built
│   └── run-gateway/        # not yet built
└── packages/
    ├── auth/       # better-auth config + email
    ├── db/         # Drizzle schema, client, migrations
    ├── ui/         # shared React component library (shadcn)
    ├── ai/         # AI provider integration (in progress)
    ├── config/     # shared eslint/tsconfig
    └── types/      # shared TypeScript types
```

A few `packages/*` and `apps/*` above are scaffolded but not yet implemented —
check the individual `package.json` in each before assuming functionality
exists.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, coding conventions, and the
PR process. Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? See [SECURITY.md](SECURITY.md) rather than opening a
public issue.

## License

[Apache License 2.0](LICENSE).

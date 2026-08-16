# Linea

Linea is an AI workflow orchestration platform: build, run, and manage
automations that combine AI models, tools, and integrations.

**Status: early and under active development.** The monorepo's foundations
(auth, workspace onboarding, role-based access) are in place; the workflow
builder and execution engine are being built out. Expect gaps and breaking
changes. If you're looking for a finished product, this isn't it yet — if
you'd like to help build one, contributions are welcome.

## Stack

TanStack Start + React 19 + Tailwind/shadcn on the frontend, NestJS on the
backend, PostgreSQL (pgvector) with Drizzle ORM, better-auth for
email/password and Google/GitHub OAuth, Resend for email, pnpm workspaces +
Turborepo for the monorepo.

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

Web runs at http://localhost:3001, the API at http://localhost:3000
(health check at `/health`).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup guide, project
layout, and environment variable reference.

## Run the demo

Once `pnpm dev` is up, see the whole system work end to end — a workflow that
calls a public API, branches, and calls a real AI model, run through the actual
execution engine and queue:

```bash
# Needs at least one of these set in .env — the demo picks whichever is available
# ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY / XAI_API_KEY
pnpm demo
```

It finds-or-creates a demo workspace and workflow (safe to run repeatedly — it
reuses them rather than duplicating), triggers a real execution, and prints the
step-by-step trace as it completes. See [`examples/pending-todo.workflow.json`](examples/pending-todo.workflow.json)
for the workflow itself.

## Monorepo layout

```
linea/
├── apps/
│   ├── platform-api/       # NestJS backend
│   ├── web/                # TanStack Start frontend
│   ├── execution-worker/   # workflow execution runtime
│   ├── background-worker/  # schedule firing
│   └── run-gateway/        # not yet built
└── packages/
    ├── auth/       # better-auth config + email
    ├── db/         # Drizzle schema, client, migrations
    ├── ui/         # shared React component library (shadcn)
    ├── ai/         # AI provider integration (Anthropic, OpenAI, Groq, xAI)
    ├── runtime/    # workflow JSON schema, node registry, graph walker
    ├── queue/      # BullMQ wrapper — workflow-execution queue
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

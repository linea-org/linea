# Repository structure

This document describes the current ownership and dependency seams in the
monorepo. Product direction belongs in `product-vision.md`; strategic
sequencing belongs in `roadmap.md`.

## Top-level layout

```text
apps/
  web/
  platform-api/
  execution-worker/
  background-worker/
  mobile/
  docs/
  run-gateway/

packages/
  protocol/
  sdk/
  sdk-react/
  runtime/
  connectors/
  ai/
  db/
  queue/
  auth/
  ui/
  config/
  types/
  sandbox-provider/
```

Apps are independently deployable entry points. An app must not import from
another app. Anything needed by more than one app belongs in `packages/*`.

## Applications

### `apps/web`

The TanStack Start workspace application. It owns workspace onboarding,
workflow catalog and graph authoring, execution and replay inspection,
regression management, settings, provider configuration, and other operator
views. It consumes browser-safe package entry points and HTTP clients; it does
not import server implementations.

### `apps/platform-api`

The NestJS HTTP application for both workspace and public `/v1` interfaces.
It owns authentication guards, workspace administration, workflow and version
management, execution starts and reads, Applications, External Subjects,
End-User Sessions, Conversations, approvals, Connections, Action Intents,
events, webhooks, audit projections, and OpenAPI publication.

It persists authoritative state before dispatching asynchronous work. The API
does not execute workflow graphs or deliver background effects itself.

### `apps/execution-worker`

Claims queued executions, interprets published workflow graphs, invokes node
handlers, renews execution leases, persists checkpoints and step records, and
resumes work after waits, approvals, consent, or process failure.

Node behavior belongs here while node schemas and presentation metadata belong
in `packages/runtime`. Connector nodes enter external providers only through
`packages/connectors`.

### `apps/background-worker`

Owns work that is asynchronous but is not graph interpretation: due schedules,
transactional-outbox dispatch, signed webhook delivery, push notifications,
provider-revocation delivery, and conversation analysis.

### `apps/mobile`

The Expo workspace-member client for monitoring executions, notifications,
signals, and workspace-audience approvals. It is an operational client, not a
second workflow authoring implementation.

### `apps/docs`

The Next.js and Fumadocs documentation site. Its deployment workflow is scoped
to documentation inputs so ordinary code-only commits do not redeploy it.

### `apps/run-gateway`

A reserved package scaffold for the future sandbox execution gateway. It is
not a shipped runtime dependency today. Do not route connectors, Connections,
or Action Consent through it; those belong to the Connector Gateway.

## Packages

### `packages/protocol`

The canonical public wire contract. It owns public resource schemas,
operation definitions, error shapes, events, cursors, idempotency inputs, and
webhook envelopes. The API and SDKs consume the same definitions.

Changes to a public operation must keep protocol schemas, the operation
registry, generated contracts, controllers, SDK methods, and contract tests in
sync.

### `packages/sdk`

Typed TypeScript clients over the public protocol:

- trusted server and workspace clients;
- browser, edge, and native End-User clients;
- DPoP and session handling;
- event streaming and authoritative reconciliation;
- webhook signature verification.

The root and server entry points may handle trusted credentials. The
`@linea/sdk/user` entry point never accepts workspace or Application secrets.

### `packages/sdk-react`

Headless React providers and hooks over `@linea/sdk/user`, optional approval
presentation, and the CopilotKit adapter. It does not redefine identity,
session, transport, Approval Request, Decision, Connection, or consent
semantics.

### `packages/runtime`

The workflow graph contract and interpreter. Node definitions own schemas,
labels, icons, fields, and summaries; worker handlers own execution behavior.
The browser entry point excludes Node-only implementation details.

Adding a normal node type requires its definition, registry entry, worker
handler, and focused validation and execution tests. Presentation should be
derived from the definition rather than duplicated in the web app.

### `packages/connectors`

The server-only Connector Gateway and registered Google and GitHub operation
families. It owns operation input validation, immutable read or side-effect
classification, required scopes, normalized bounded results, safe display,
provider preconditions, and redacted provider errors.

The gateway resolves protected credentials and enforces Application,
Connection, provider-account, External Subject, scope, Action Intent, and
consent rules. Workflow authors and models cannot downgrade operation
classification or manufacture Action Intents.

### `packages/ai`

The model registry, Anthropic and OpenAI-compatible provider adapters,
workspace-first key resolution, shared completion and tool-call shapes, and
pricing information. Runtime callers select registered model IDs rather than
inferring a provider from arbitrary strings.

### `packages/db`

The PostgreSQL persistence module. It owns Drizzle schemas, migrations,
repositories, transaction-compatible repository interfaces, secret and
Connection credential encryption, and durable records for workflow,
execution, public-application, connector, audit, regression, notification,
and analysis features.

Cross-tenant and cross-subject access rules belong in repository queries and
the calling authorization module, not in UI filtering.

### `packages/queue`

BullMQ connection helpers, queue names, and stable job payload contracts.
Messages carry durable record identifiers; workers reload authoritative state
from Postgres instead of treating a Redis payload as the record of truth.

### `packages/auth`

Shared better-auth configuration and branded email delivery used by the web
workspace and Platform API.

### `packages/ui`

Shared React primitives and design tokens. App-specific workflow behavior does
not belong here.

### `packages/config` and `packages/types`

Shared lint and TypeScript configuration, plus narrow internal types that do
not belong to the public protocol or a more specific feature package.

### `packages/sandbox-provider`

A reserved scaffold for future sandbox adapters. No sandbox or arbitrary code
execution capability is currently shipped.

## Important execution paths

### Workflow execution

```text
client
  → Platform API
  → Postgres execution + outbox state
  → BullMQ
  → execution-worker
  → runtime interpreter
  → node handlers
  → execution steps and checkpoints
```

### Public End-User execution

```text
Operator OIDC provider
  → client-side authorization code + PKCE
  → DPoP-bound End-User Session
  → Application-scoped /v1 operation
  → Workflow Contract binding
  → normal durable execution path
```

### Connector side effect

```text
connector node
  → Connector Gateway
  → immutable Action Intent
  → external-subject Approval Request
  → immutable Decision
  → atomic execution claim
  → provider adapter
  → bounded result + audit fact + public event
```

## Dependency rules

1. Apps do not import from apps.
2. Browser code uses browser-safe package exports only.
3. Public wire shapes live in `packages/protocol`, not in an SDK or controller.
4. Node presentation metadata lives with the node definition in
   `packages/runtime`.
5. Protected provider credentials are resolved only inside trusted server
   modules.
6. Connector side effects pass through the Connector Gateway and exact-intent
   consent; an Approval node is not an authorization substitute.
7. Postgres is authoritative for durable work. Queues carry identifiers and
   may be redelivered.
8. Native execution records remain distinguishable from any future imported
   observed trace because only native work is replayable.

## Capabilities not present yet

- Owned document ingestion, chunking, embeddings, vector retrieval, and RAG.
- A production `packages/kb` module.
- Sandboxed customer code and a production Run Gateway.
- Arbitrary or user-supplied MCP servers.
- A production multi-agent or subagent runtime.

Add these only through dedicated issues with explicit identity, authority,
retention, observability, and launch-gate acceptance criteria.

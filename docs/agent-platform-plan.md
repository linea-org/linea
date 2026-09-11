# Agent Platform Modularization and Developer Interface Plan

## Status

Planning document only. This document does not authorize implementation, package moves, route changes, schema migrations, issue creation, or publishing.

The accepted security and domain decisions in `docs/end-user-approval-protocol.md`, `CONTEXT.md`, and the accepted ADRs remain authoritative. This plan explains how to turn those decisions into maintainable package interfaces, a complete developer interface, generated route documentation, and SDKs when implementation begins.

The GitHub repository `linea-org/linea` is currently private. It already uses Apache-2.0 and contains `SECURITY.md` and `CONTRIBUTING.md`. The accepted open-source target is to make this monorepo public after the launch audit and repository-access controls in this plan are complete.

## Executive decision

Linea is an agent platform, not merely a workflow platform. A Workflow remains the precise domain term for the executable graph an agent uses. It should not be renamed into a vague `agent` object because the same agentic product can contain workflows, conversations, executions, memory, approvals, connections, and actions.

The repository should remain one monorepo. The useful split is between package interfaces, not repositories. A package is justified when it creates a real seam used by multiple callers, hides meaningful behavior, or must be published independently. Moving files into many shallow packages would make the system harder to understand without improving isolation.

The first structural target is one browser-safe protocol module shared by the platform API, SDKs, React SDK, web app, and mobile app. Public route definitions, validation schemas, stable errors, event envelopes, and generated OpenAPI must come from that single source. Route documentation and SDK coverage should be checked against it in CI so they cannot silently drift.

Open source applies to the repository's source, including apps and internal packages. Npm publication remains selective: only developer-facing packages are published. Production credentials, customer data, deployment secrets, private security reports, and hosted-service access remain private. Source visibility is not the security control for any credential or production system.

## Goals

- Present Linea consistently as an agent platform while keeping exact domain language in code.
- Give third-party builders a stable, versioned interface for building applications on Linea.
- Document every route, its intended caller, authentication, wire contract, errors, and SDK method.
- Keep browser and native clients free of workspace or Application server credentials.
- Store each end user's conversations as independent threads instead of merging all of their messages.
- Split packages only at seams that create leverage and locality.
- Preserve current SDK users through a deliberate compatibility transition.
- Make the public contract testable independently from NestJS controllers and database types.
- Keep the full end-user protocol designed and ready without forcing speculative implementation before a real client defines the first required slice.

## Non-goals

- Splitting the monorepo into separate repositories.
- Renaming every Workflow symbol to Agent.
- Exposing every operator dashboard route as a public developer route.
- Publishing packages before an external consumer needs them.
- Implementing Applications, Workflow Contracts, OIDC, DPoP, Connections, or Action Consent as part of package reorganization.
- Replacing accepted ADRs or the detailed end-user approval protocol with this summary.
- Deleting the existing draft documents before their unique material is reviewed and preserved.

## Product and domain language

Use these layers consistently:

- **Agent platform**: the product category. It provides execution, memory, knowledge, identity, approvals, sandboxing, observability, and regression testing.
- **Workflow**: an authored executable graph and its published implementations.
- **Workflow Contract**: an immutable public input/output promise exposed through an Application.
- **Execution**: one run of one published Workflow implementation in `draft`, `dev`, or `production`.
- **Application**: one deployed Operator product and security boundary, pinned to `dev` or `production`.
- **External Subject**: Linea's identity record for an Operator's End User.
- **Conversation**: one independent thread for one External Subject, Application, Workflow, and environment.
- **Approval Request**: a durable request for a human decision.
- **Decision**: the immutable approve or reject outcome.
- **Connection**: an Application-scoped relationship to an external service.
- **Action Intent**: the immutable description of a proposed external side effect.
- **Action Consent**: authorization for the exact Action Intent or an explicit policy covering it.
- **Regression**: saved cases replayed against Workflow versions to detect behavioral changes.
- **Evaluator**: a node that measures inputs while a Workflow executes. Established technique names such as G-Eval remain unchanged.

The product can be described as agentic without weakening the model. “Workflow” describes how behavior is executed; “agent platform” describes the larger system developers build on.

## Architectural principles

### Deep modules

Each target package is a module with one coherent interface. The interface includes types, invariants, error behavior, authentication assumptions, and performance or ordering requirements. Internal implementation details stay behind that seam.

Create a package only when at least one is true:

- at least three concrete callers need the same behavior;
- browser-safe code must be isolated from Node-only dependencies;
- the package needs an independent release lifecycle;
- deleting the package would force substantial behavior back into several callers.

Do not create pass-through packages that merely re-export another module. Do not introduce hypothetical ports with one adapter. Production and test adapters make a seam real; otherwise keep the implementation local.

### Contract first, framework second

NestJS controllers are adapters for the public protocol, not the source of the protocol. Database schemas are persistence implementation details, not wire contracts. SDK response types must not be copied from database rows.

### Two planes

- The **control plane** is for Linea workspace members and trusted Operator backends.
- The **end-user plane** is for an Operator's End Users through short-lived, proof-bound sessions.

An endpoint, credential, SDK client, or type must belong clearly to one plane. A workspace key must never be shipped to a browser. An Application key must never act as an End User. An End-User Session must never gain workspace administration authority.

### Environment belongs to traffic

Audience is not a Workflow property. Every Execution records its environment. Builder traffic is `draft`; an Application pins either `dev` or `production`; End-User starts inherit that Application environment and cannot override it. Behavior analysis and end-user retention apply only to `production` traffic.

## Current repository baseline

The repository currently has reusable packages for AI providers, authentication, configuration, database access, queues, runtime graph behavior, the server SDK, and UI. `packages/sdk-react`, `packages/connectors`, `packages/sandbox-provider`, and `packages/types` are currently placeholders or incomplete seams.

The current `@linea/sdk` is a Node-only workspace-key client. It hand-maintains wire types and supports these methods:

| SDK method               | Current route                              |
| ------------------------ | ------------------------------------------ |
| `triggerWorkflow`        | `POST /v1/triggers/:slug`                  |
| `getExecution`           | `GET /v1/executions/:id`                   |
| `listWorkflowExecutions` | `GET /v1/workflows/:workflowId/executions` |
| `listExecutions`         | `GET /v1/executions`                       |
| `countNewExecutions`     | `GET /v1/executions/new-count`             |
| `listSignals`            | `GET /v1/signals`                          |
| `getSignalsTrend`        | `GET /v1/signals/trend`                    |
| `getSignal`              | `GET /v1/signals/:id`                      |
| `resolveSignal`          | `POST /v1/signals/:id/resolve`             |

Everything else is currently consumed directly by first-party applications or has no SDK wrapper. That is acceptable for internal control-plane routes, but public developer routes require explicit SDK and documentation coverage.

## Current route catalogue

This is the planning baseline. During implementation, the route registry and generated OpenAPI replace this hand-maintained inventory.

| Area                  | Current routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Intended surface                               | Current SDK        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------ |
| System                | `GET /v1`, `GET /v1/health`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Operations                                     | None               |
| Authentication        | `/v1/auth/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | First-party web and mobile                     | Better Auth client |
| Current member        | `GET /v1/me`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Operator control plane                         | None               |
| API keys              | `POST /v1/api-keys`, `GET /v1/api-keys`, `DELETE /v1/api-keys/:id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Operator control plane                         | None               |
| Applications          | `POST /v1/applications`, `GET /v1/applications`, `GET /v1/applications/:id`, `PATCH /v1/applications/:id`, `PUT /v1/applications/:id/trust-configuration`, `POST /v1/applications/:id/disable`, `POST /v1/applications/:applicationId/keys`, `GET /v1/applications/:applicationId/keys`, `POST /v1/applications/:applicationId/keys/:id/rotate`, `DELETE /v1/applications/:applicationId/keys/:id`, `POST /v1/applications/:applicationId/subjects`, `POST /v1/applications/:applicationId/executions`, `GET /v1/applications/:applicationId/workflow-bindings`, `PUT /v1/applications/:applicationId/workflow-bindings/:workflowId`, `POST /v1/external-subjects/:id/disable`, `DELETE /v1/external-subjects/:id` | Operator control plane and Application runtime | None               |
| Workspace approvals   | `GET /v1/approvals`, `POST /v1/approvals/:id/respond`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Operator web and mobile                        | None               |
| Conversation analysis | `GET /v1/workflows/:workflowId/conversations/:conversationId/analysis`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Operator control plane                         | None               |
| Workflow execution    | `POST /v1/workflows/:workflowId/executions`, `GET /v1/workflows/:workflowId/executions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Operator control plane                         | List only          |
| Builder testing       | `POST /v1/workflows/:workflowId/test-run`, `POST /v1/workflows/:workflowId/chat-preview`, `GET /v1/workflows/:workflowId/chat-preview/conversations`, `GET /v1/workflows/:workflowId/chat-preview/:conversationId/messages`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Builder-only control plane                     | None               |
| Workspace executions  | `GET /v1/executions`, `GET /v1/executions/new-count`, `GET /v1/executions/:id`, `POST /v1/executions/:id/steps/:stepId/replay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Operator control plane                         | All except replay  |
| Notifications         | `GET /v1/notifications`, `GET /v1/notifications/unread-count`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/:id/unread`, `POST /v1/notifications/read-all`, `POST /v1/notifications/:id/archive`, `POST /v1/notifications/:id/unarchive`, `DELETE /v1/notifications/:id`                                                                                                                                                                                                                                                                                                                                                                                                                             | First-party web and mobile                     | None               |
| Regression Cases      | `GET /v1/workflows/:workflowId/regression-cases`, `POST /v1/workflows/:workflowId/regression-cases/from-step`, `POST /v1/workflows/:workflowId/regression-cases/from-flag`, `POST /v1/workflows/:workflowId/regression-cases/:id/archive`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Operator control plane                         | None               |
| Regression Runs       | `GET /v1/workflows/:workflowId/regression-runs`, `POST /v1/workflows/:workflowId/regression-runs`, `GET /v1/workflows/:workflowId/regression-runs/:id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Operator control plane                         | None               |
| Secrets               | `GET /v1/secrets`, `GET /v1/secrets/providers`, `PUT /v1/secrets/:key`, `DELETE /v1/secrets/:key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Operator control plane                         | None               |
| Signals               | `GET /v1/signals`, `GET /v1/signals/trend`, `GET /v1/signals/:id`, `POST /v1/signals/:id/resolve`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Operator and workspace automation              | Complete           |
| Trigger               | `POST /v1/triggers/:slug`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Workspace automation, transitional             | `triggerWorkflow`  |
| Workflows             | `POST /v1/workflows`, `GET /v1/workflows`, `GET /v1/workflows/:id`, `PATCH /v1/workflows/:id`, `PUT /v1/workflows/:id/draft`, `POST /v1/workflows/:id/realtime-token`, `POST /v1/workflows/:id/versions`, `GET /v1/workflows/:id/versions/:versionId`, `POST /v1/workflows/:id/versions/:versionId/publish`, Socket.IO namespace `/v1/workflows` on `/v1/socket.io`                                                                                                                                                                                                                                                                                                                                                | Operator control plane                         | None               |
| Workflow Contracts    | `POST /v1/workflows/:workflowId/contracts`, `GET /v1/workflows/:workflowId/contracts`, `GET /v1/workflows/:workflowId/contracts/:contractRevisionId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Operator control plane                         | None               |

The implementation phase must verify authentication and response schemas from code before treating this table as reference documentation. This inventory records intent, not a compatibility promise.

## Target package map

### `@linea/protocol`

Purpose: own browser-safe public wire contracts.

Interface:

- Zod request, response, query, parameter, error, event, and webhook schemas;
- inferred TypeScript types;
- stable operation identifiers;
- route metadata needed to generate OpenAPI 3.1 and reference documentation;
- idempotency and pagination envelopes;
- public error codes and safe error shapes;
- public Workflow Contract schemas.

Constraints:

- no NestJS, database, BullMQ, React, Node-only, or secret-handling imports;
- no business orchestration or HTTP client implementation;
- every public route parses both input and output at its system boundary;
- internal operator-only routes may adopt the module later but do not block the public seam.

Why this package is justified: the platform API, server SDK, user SDK, React SDK, web app, mobile app, tests, OpenAPI generator, and documentation all need the same contracts.

### `@linea/runtime`

Purpose: remain the deep module for Workflow graph definitions, node registration, validation, traversal, and runtime-safe configuration.

Keep it coherent. Do not split every node family into a package. The public Workflow Contract belongs in `@linea/protocol`; the internal executable graph belongs in `@linea/runtime`.

### `@linea/sdk`

Purpose: provide the public TypeScript developer interface over the versioned protocol.

Planned exports:

- `@linea/sdk/server`: trusted backend client for Application and workspace operations;
- `@linea/sdk/user`: browser and React Native client for OIDC exchange, DPoP sessions, Conversations, Executions, Approval Requests, Decisions, and events;
- `@linea/sdk/webhooks`: signature verification, timestamp validation, and typed webhook parsing;
- `@linea/sdk`: compatibility exports for the current `LineaClient` during migration.

The clients should hide transport details, DPoP nonce handling, idempotency-key generation, event reconciliation, pagination cursors, and safe error parsing. Callers should learn domain operations, not HTTP mechanics.

The browser client must never accept a workspace or Application key. The server client must never expose an external-subject Decision method.

### `@linea/sdk-react`

Purpose: provide headless React hooks and optional presentation for the end-user plane.

Dependencies should be limited to React, `@linea/protocol`, and `@linea/sdk/user`. CopilotKit remains an adapter behind the headless interface, not the foundation. A vanilla browser integration and the headless hooks must work before CopilotKit-specific packaging begins.

### `@linea/ai`

Purpose: keep model-provider behavior, model invocation, and provider-normalized results together.

Credential lookup should move out only when the credential module below is introduced. Do not split one package per provider merely for file organization.

### `@linea/credentials`

Purpose: hide workspace credential resolution, decryption, legacy compatibility, and platform fallback behind one small internal interface.

This is justified because the behavior is security-sensitive and already serves several callers. It should remain unpublished and Node-only even though its source is public. Production uses the database/encryption adapter; tests use a controlled adapter through an internal seam.

### `@linea/db` and `@linea/queue`

Keep both as internal deep modules. Database tables and BullMQ job payloads are not public protocol types. Queue identity, retry policy, deduplication, delivery, and compatibility belong together. Package splitting must not rename durable queues or database objects.

### Placeholder packages

Do not populate `connectors`, `sandbox-provider`, or `sdk-react` simply because directories exist. Each begins only when its real interface and at least two concrete consumers or adapters are known. Remove a placeholder in a later cleanup if it continues to have no role.

## Physical repository shape

### Recommended shape now: one repository, several release units

“Split” should initially mean independently owned packages inside the existing repository, not one Git repository per package. Keeping the platform, protocol, and SDK source together allows a route contract, its server adapter, its SDK method, its tests, and its documentation to change atomically in one PR.

```text
linea/
  apps/
    platform-api/
    execution-worker/
    background-worker/
    web/
    mobile/
  packages/
    protocol/
    sdk/
    sdk-react/
    runtime/
    ai/
    credentials/
    auth/
    db/
    queue/
    config/
    ui/
  examples/
    server-typescript/
    browser-typescript/
    react-approval/
    react-native-approval/
  docs/
    guides/
    reference/
    adr/
  package.json
  pnpm-workspace.yaml
  turbo.json
```

The packages are separate modules and potential npm release units even though they share one Git repository. Internal packages remain `"private": true` in npm terms even though their source is visible in the public repository. Only `@linea/protocol`, `@linea/sdk`, and later `@linea/sdk-react` are prepared for public package release.

The `examples` directory should be added only alongside the first implemented public protocol. It is shown here to make the final ownership explicit, not as work to begin now.

### `packages/protocol`

```text
packages/protocol/
  src/
    operations/
      application-executions.ts
      application-conversations.ts
      user-sessions.ts
      user-executions.ts
      user-conversations.ts
      user-approval-requests.ts
      application-events.ts
    resources/
      application.ts
      conversation.ts
      execution.ts
      external-subject.ts
      approval-request.ts
      decision.ts
    errors/
      error-code.ts
      error-response.ts
    events/
      event-envelope.ts
      event.ts
    webhooks/
      webhook-envelope.ts
      webhook-event.ts
    shared/
      cursor.ts
      idempotency.ts
      pagination.ts
    registry.ts
    index.ts
  scripts/
    generate-openapi.ts
    generate-route-reference.ts
  test/
    registry.spec.ts
    openapi.spec.ts
  package.json
  tsconfig.json
  tsup.config.ts
```

Rules:

- `resources` owns reusable public resource projections, never database rows.
- `operations` owns the request, response, parameters, metadata, and errors for complete public operations.
- `events` and `webhooks` reuse resource projections but own their distinct envelopes.
- `shared` contains only wire concepts with at least three concrete uses.
- `registry.ts` exports the complete public operation catalogue used by generation and coverage checks.
- consumers import only documented package exports, never `src/*` paths.
- generation scripts are development tooling and are not part of the browser runtime export.

Suggested exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./operations": "./dist/operations/index.js",
    "./events": "./dist/events/index.js",
    "./webhooks": "./dist/webhooks/index.js"
  }
}
```

The real package manifest must provide matching `types`, ESM, and CommonJS entries according to the repository's supported module policy. The example shows the intended public surface, not a complete manifest.

### `packages/sdk`

```text
packages/sdk/
  src/
    server/
      application-client.ts
      workspace-client.ts
      index.ts
    user/
      user-client.ts
      session-exchange.ts
      dpop-session.ts
      proof-key-store.ts
      event-stream.ts
      index.ts
    webhooks/
      verify-webhook.ts
      index.ts
    transport/
      http-transport.ts
      fetch-adapter.ts
      transport-error.ts
    legacy/
      linea-client.ts
    index.ts
    server.ts
    user.ts
    webhooks.ts
  test/
    server-client.spec.ts
    user-client.spec.ts
    dpop-session.spec.ts
    verify-webhook.spec.ts
    legacy-client.spec.ts
  package.json
  tsconfig.json
  tsup.config.ts
```

Rules:

- `server` accepts only Application or workspace server credentials.
- `user` accepts identity/session inputs and owns proof-key and DPoP mechanics; it cannot accept a server key.
- `webhooks` is pure verification and typed parsing; it does not make Linea requests.
- `transport` is private implementation shared by SDK clients, not a public subpath.
- `legacy` keeps the current `LineaClient` working during migration.
- SDK methods accept and return types imported from `@linea/protocol`; the SDK does not redeclare wire shapes.

Suggested exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server.js",
    "./user": "./dist/user.js",
    "./webhooks": "./dist/webhooks.js"
  }
}
```

### `packages/sdk-react`

```text
packages/sdk-react/
  src/
    provider/
      linea-user-provider.tsx
    hooks/
      use-conversation.ts
      use-execution.ts
      use-approval-requests.ts
      use-decision.ts
    components/
      approval-request.tsx
      approval-request-fields.tsx
    adapters/
      copilotkit/
        copilotkit-approval-action.tsx
    index.ts
    copilotkit.ts
  test/
    provider.spec.tsx
    approval-request.spec.tsx
    copilotkit-approval-action.spec.tsx
  package.json
  tsconfig.json
  tsup.config.ts
```

Rules:

- hooks own orchestration and expose headless state;
- presentation is one schema-driven Approval Request component, not one component per approval variant;
- the CopilotKit adapter imports the headless hooks rather than owning session or transport behavior;
- public props use protocol types or explicit UI input types local to `sdk-react`;
- no database, NestJS, workspace-auth, or queue imports.

### `packages/runtime`

```text
packages/runtime/
  src/
    graph/
      graph-schema.ts
      validate-graph.ts
      walk-graph.ts
    nodes/
      definitions/
      node-definition.ts
      node-registry.ts
    execution/
      execution-input.ts
      execution-result.ts
    browser.ts
    index.ts
  test/
  MODULE.md
  package.json
```

This is an illustrative target organization around its existing concerns, not a request to rewrite it. Node-specific UI metadata remains attached to node definitions so palettes, canvases, and configuration panels consume one registry. Internal graph and node types remain owned here; only published input/output contracts move to `@linea/protocol`.

### `packages/ai`

```text
packages/ai/
  src/
    providers/
      anthropic.ts
      groq.ts
      openai.ts
    generate.ts
    stream.ts
    model.ts
    errors.ts
    index.ts
  test/
  package.json
```

`@linea/ai` owns provider normalization and invocation results. It receives an already resolved credential through its interface or consumes the small internal credential resolver. It must not expose database rows or require callers to understand provider-specific response objects.

### `packages/credentials`

```text
packages/credentials/
  src/
    resolve-provider-credential.ts
    credential.ts
    adapters/
      postgres-credential-store.ts
      memory-credential-store.ts
    index.ts
  test/
    resolve-provider-credential.spec.ts
  package.json
```

`Credential` is an internal secret value with the minimum metadata needed by `@linea/ai`. The Postgres adapter owns persistence, decryption, legacy compatibility, and platform fallback. The memory adapter exists for interface-level tests. Neither adapter becomes part of the package's external interface.

### `packages/db`

```text
packages/db/
  src/
    schema/
    repositories/
    migrations/
    client.ts
    index.ts
  test/
  drizzle.config.ts
  package.json
```

This package owns persistence schemas, transactional repositories, and migrations. Apps and internal packages may consume repository results, but public clients never import from `@linea/db`. A controller or presenter maps persistence results into `@linea/protocol` resource projections.

### `packages/queue`

```text
packages/queue/
  src/
    jobs/
      workflow-execution.ts
      regression-run.ts
      event-delivery.ts
    publishers/
    consumers/
    queue-client.ts
    index.ts
  test/
  package.json
```

Queue job schemas, durable queue identities, retry policy, and BullMQ adapters stay together. Job types are shared only between publishers and workers through `@linea/queue`; they never enter `@linea/protocol` merely because they are serialized.

### `packages/config`, `packages/auth`, and `packages/ui`

- `@linea/config` owns build, lint, TypeScript, and environment parsing conventions already shared across workspaces. It must not become a miscellaneous runtime helper package.
- `@linea/auth` owns Linea workspace-member authentication behavior. End-User Session protocol types live in `@linea/protocol`, while their server-side verification implementation belongs in the platform API or a later identity module only if several deployed callers need it.
- `@linea/ui` owns first-party design-system primitives. Public SDK React components may reuse design tokens only when that does not force an Operator's application to install the entire internal UI system.

### Applications

The apps stay deployment units rather than shared-code owners:

```text
apps/platform-api/src/
  applications/
    applications.controller.ts
    applications.service.ts
    applications.presenter.ts
  user-sessions/
  user-conversations/
  user-executions/
  approval-requests/
  common/
    protocol-validation.pipe.ts
    protocol-error.filter.ts
```

Each controller is a transport adapter. It validates with `@linea/protocol`, invokes an application module, maps internal results through a presenter, validates the outgoing public projection, and returns it. Business behavior does not move into the protocol package or controller.

`apps/execution-worker` consumes `@linea/runtime`, `@linea/queue`, `@linea/ai`, and `@linea/credentials`. `apps/background-worker` owns delayed and delivery processing. `apps/web` and `apps/mobile` remain first-party clients; they may consume protocol types but do not export code to other apps.

## Type ownership and sharing rules

There should not be one generic `packages/types` dumping ground. Every type has one semantic owner:

| Type category                                   | Owner                             | Consumers                                 | Must not leak into                            |
| ----------------------------------------------- | --------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Public request/response/query/path types        | `@linea/protocol` operations      | API, SDKs, examples, generated docs       | Database schema definitions                   |
| Public resource projections                     | `@linea/protocol` resources       | API presenters, SDKs, React SDK           | Raw internal secrets or node state            |
| Public error codes and envelopes                | `@linea/protocol` errors          | API error filter, SDK errors, docs        | Provider-specific exceptions                  |
| Public events and webhook envelopes             | `@linea/protocol` events/webhooks | Outbox presenter, SDKs, webhook consumers | BullMQ job payloads                           |
| Workflow graph and node configuration           | `@linea/runtime`                  | Builder, platform API, workers            | General public REST responses                 |
| Persistence rows and repository inputs          | `@linea/db`                       | Platform API and workers                  | SDKs, webhooks, public docs                   |
| Queue jobs and delivery metadata                | `@linea/queue`                    | Publishers and workers                    | SDKs and public protocol                      |
| Provider-normalized model values                | `@linea/ai`                       | Runtime and workers                       | Public protocol unless deliberately projected |
| SDK options, transport state, and client errors | `@linea/sdk`                      | SDK callers                               | Platform persistence                          |
| React hook state and component props            | `@linea/sdk-react`                | Operator applications                     | Protocol operation registry                   |
| Page-specific view models                       | Owning app feature                | That page or feature                      | Shared packages without three users           |

`packages/types` should therefore remain unused and be removed once imports confirm it has no owner-specific content. A new type is placed beside the behavior that gives it meaning. A type moves into `@linea/protocol` only when it is part of the supported wire contract.

## Concrete type flow

### 1. The protocol defines and names the wire contract

An operation file owns its schemas and inferred types:

```typescript
import { z } from "zod"
import { executionSchema } from "../resources/execution.js"

export const startApplicationExecutionRequestSchema = z.object({
  workflowContractId: z.string().uuid(),
  externalSubjectId: z.string().uuid(),
  input: z.record(z.string(), z.unknown()),
})

export const startApplicationExecutionResponseSchema = z.object({
  execution: executionSchema,
})

export type StartApplicationExecutionRequest = z.infer<
  typeof startApplicationExecutionRequestSchema
>

export type StartApplicationExecutionResponse = z.infer<
  typeof startApplicationExecutionResponseSchema
>

export const startApplicationExecutionOperation = {
  operationId: "startApplicationExecution",
  method: "POST",
  path: "/v1/applications/{applicationId}/executions",
  auth: "application_key",
  scope: "executions:start",
  request: startApplicationExecutionRequestSchema,
  response: startApplicationExecutionResponseSchema,
  successStatus: 202,
  idempotency: "required",
} satisfies PublicOperation
```

`PublicOperation` describes registry metadata shared by many operations. The operation does not know about NestJS, fetch, Postgres, or React.

### 2. The platform API adapts HTTP to internal behavior

```typescript
import {
  startApplicationExecutionRequestSchema,
  startApplicationExecutionResponseSchema,
  type StartApplicationExecutionRequest,
} from "@linea/protocol/operations"

@Post("applications/:applicationId/executions")
async startExecution(
  @Param("applicationId", new ParseUUIDPipe()) applicationId: string,
  @Body(new ProtocolValidationPipe(startApplicationExecutionRequestSchema))
  input: StartApplicationExecutionRequest,
) {
  const execution = await this.executions.start(applicationId, input)
  return startApplicationExecutionResponseSchema.parse({ execution })
}
```

The platform bootstrap applies `/v1` globally, so controller decorators own only the route below that prefix. The real controller also obtains the authenticated Application principal and idempotency key. They are omitted from this narrow type-flow example. The important rule is that incoming and outgoing data cross the same protocol schemas used by the SDK.

The application module may use richer internal types. Its presenter produces the public `Execution` projection and explicitly excludes internal node configuration, credentials, raw provider errors, and workspace-only data.

### 3. The SDK executes the registered operation

```typescript
import {
  startApplicationExecutionOperation,
  type StartApplicationExecutionRequest,
  type StartApplicationExecutionResponse,
} from "@linea/protocol/operations"

export class LineaApplicationClient {
  private readonly transport: HttpTransport
  constructor(options: LineaApplicationClientOptions) {
    this.transport = createApplicationTransport(options)
  }
  startExecution(
    applicationId: string,
    input: StartApplicationExecutionRequest
  ): Promise<StartApplicationExecutionResponse> {
    return this.transport.execute(startApplicationExecutionOperation, {
      path: { applicationId },
      body: input,
    })
  }
}
```

The SDK does not repeat the URL, validation, error list, or response type. The transport uses operation metadata to build the request and parses the response with the registered response schema. A malformed server response becomes a loud SDK protocol error.

### 4. A trusted Operator backend uses the server client

```typescript
import { LineaApplicationClient } from "@linea/sdk/server"

const linea = new LineaApplicationClient({
  applicationKey: applicationKeyFromServerEnvironment,
  baseUrl: lineaBaseUrl,
})

const { execution } = await linea.startExecution(applicationId, {
  workflowContractId,
  externalSubjectId,
  input: { ticketId },
})
```

The Application key exists only in trusted server code. Protocol types provide editor completion and compile-time checking, while Zod validates the actual network boundary at runtime.

### 5. An End User's browser or native app uses the user client

```typescript
import { LineaUserClient } from "@linea/sdk/user"

const linea = await LineaUserClient.exchange({
  applicationId,
  identityToken,
  proofKeyStore,
})

await linea.sendMessage(conversationId, {
  content: message,
  idempotencyKey,
})

await linea.decide(approvalRequestId, {
  decision: "approve",
  idempotencyKey: decisionIdempotencyKey,
})
```

The user client owns the opaque session token, proof key, DPoP nonce, request proof, expiry, and safe retry behavior. The application never receives an option for a workspace or Application key, and the Operator backend never receives the End-User Session as part of the intended flow.

### 6. React builds on the user client instead of duplicating it

```tsx
import {
  ApprovalRequest,
  useApprovalRequests,
  useDecision,
} from "@linea/sdk-react"

function PendingApproval() {
  const { pending } = useApprovalRequests()
  const decide = useDecision()
  const request = pending[0]
  if (!request) return null
  return (
    <ApprovalRequest
      request={request}
      onApprove={() => decide(request.id, "approve")}
      onReject={() => decide(request.id, "reject")}
    />
  )
}
```

`LineaUserProvider` supplies the user client above this component. Hook state derives from protocol resource types. The React package owns loading, event reconciliation, and UI state; it does not redefine an Approval Request or call raw route strings.

### 7. Events and webhooks reuse projections without becoming identical

An Execution event references or embeds only its documented safe projection. A webhook wraps an event in the versioned webhook envelope and signature metadata. A BullMQ delivery job contains internal attempt and scheduling data, so it has a separate `@linea/queue` type even when its payload includes a protocol webhook event.

This prevents the common mistake of treating every serialized object as one universal shared type.

## Shared implementation versus shared types

Share a type when callers must agree on data meaning. Share implementation when callers must agree on behavior. These are separate decisions.

- Zod schemas and wire types are shared through `@linea/protocol` because the platform API and clients must agree exactly.
- HTTP retries and DPoP are shared through `@linea/sdk` because clients must behave consistently.
- graph validation is shared through `@linea/runtime` because builders and workers must interpret graphs identically.
- credential resolution is shared through `@linea/credentials` because security and fallback behavior must not drift.
- database repositories are not shared with SDKs because persistence behavior is irrelevant to public callers.
- page view models remain local because visual presentation is not a platform contract.

Never copy a protocol type into an app to avoid importing its owner. Never move an internal type into protocol merely to avoid two similar declarations when the meanings differ.

## Open-source repository decision

The accepted target is one public repository: `linea-org/linea`. Do not create `linea-developer` or one repository per package now.

One public monorepo gives builders one place to:

- understand how protocol schemas connect to server behavior;
- inspect SDK and runtime implementation;
- run examples and tests;
- open issues and pull requests;
- follow a route change from contract through implementation;
- build the complete system locally.

This also keeps a protocol change, platform adapter, SDK method, generated documentation, and integration tests atomic in one PR. Package interfaces still prevent inappropriate coupling; Git repository separation is not needed to create those seams.

### What becomes public

- all tracked source under `apps/*` and `packages/*`;
- public and internal tests that do not contain customer or production data;
- schema migrations;
- local Docker development configuration;
- SDK examples;
- generated OpenAPI and route reference;
- architecture, protocol, security, and contribution documentation;
- CI workflows whose secrets are referenced only by name.

Internal npm packages remain unpublished with `"private": true`. Their source being public does not make them supported developer interfaces.

### What remains private

- GitHub, npm, cloud, database, email, OAuth, model-provider, and signing credentials;
- production and staging environment values;
- customer data, conversations, prompts, logs, traces, and backups;
- private vulnerability reports and embargoed fixes;
- operational incident records;
- deployment access and cloud account configuration that exposes sensitive topology or identifiers;
- commercial agreements and private customer integration material;
- future proprietary modules only if a deliberate open-core decision creates them.

Secrets must never depend on source secrecy. Credential checks, authorization, tenant isolation, signature verification, and encryption must remain safe when their implementation is visible.

### Repository access model

| Actor                 | Source and docs                  | Issues and discussions                 | Pull requests                        | Merge                | Releases                              | Production                                      |
| --------------------- | -------------------------------- | -------------------------------------- | ------------------------------------ | -------------------- | ------------------------------------- | ----------------------------------------------- |
| Anonymous user        | Read and clone                   | Read                                   | None                                 | None                 | Install public packages               | None                                            |
| GitHub user           | Read and clone                   | Open and comment subject to moderation | Fork and propose                     | None                 | Install public packages               | None                                            |
| External contributor  | Read and clone                   | Participate                            | Propose changes and run untrusted CI | None                 | None                                  | None                                            |
| Triage maintainer     | Read and clone                   | Label, close, moderate                 | Review                               | None                 | None                                  | None                                            |
| Code maintainer       | Read and clone                   | Manage                                 | Review and approve owned paths       | Protected merge only | None by default                       | None                                            |
| Release maintainer    | Read and clone                   | Manage                                 | Review                               | Protected merge      | Approve protected release environment | None by default                                 |
| Deployment automation | Read pinned commits and packages | None                                   | None                                 | None                 | None                                  | Deploy through a separate protected environment |

Public pull requests must never receive repository secrets. Workflows triggered by forks run with read-only permissions and no privileged credentials. Publishing and deployment run only from protected branches or manually approved GitHub environments after the commit is trusted.

### Code ownership

Add `.github/CODEOWNERS` before launch, using real Linea organization teams rather than individual accounts. The intended ownership areas are:

```text
/packages/protocol/       protocol maintainers
/packages/sdk/            SDK maintainers
/packages/sdk-react/      SDK maintainers
/packages/runtime/        runtime maintainers
/packages/auth/           security maintainers
/packages/credentials/    security maintainers
/packages/db/             platform maintainers
/packages/queue/          platform maintainers
/apps/platform-api/       platform maintainers
/apps/*-worker/           runtime and platform maintainers
/.github/workflows/       release and security maintainers
/docs/adr/                architecture maintainers
```

The exact team handles are a launch-time organization decision. Sensitive paths require owner review. CODEOWNERS supports review routing; branch protection remains the enforcement mechanism.

### Branch and workflow protection

Protect `main` with:

- pull requests required;
- required passing build, lint, typecheck, format, test, package, and security checks;
- required review for owned or security-sensitive paths;
- stale approval dismissal after new commits;
- resolved conversations required;
- no direct pushes except a narrowly controlled emergency path;
- no force pushes or branch deletion;
- signed release tags;
- GitHub Actions pinned to full commit SHAs;
- least-privilege workflow `permissions` blocks;
- dependency updates reviewed like any other code.

Use private vulnerability reporting and the existing `contact@getlinea.app` route. `SECURITY.md` must clearly distinguish source vulnerabilities from hosted-service reports and state supported package versions after releases begin.

### Npm access model

Publish only:

- `@linea/protocol`;
- `@linea/sdk`;
- `@linea/sdk-react` when its headless interface is ready.

Use npm trusted publishing through GitHub OIDC with provenance. Do not store a long-lived npm token in repository secrets. Publishing runs from a protected GitHub environment and requires a release-maintainer approval. Package manifests explicitly whitelist files so tests, local configuration, and unrelated source are not accidentally shipped.

Internal packages stay `private` and fail publishing attempts. A CI matrix runs `pnpm pack` on every public package, inspects the archive, installs it into clean example projects, and verifies ESM, CommonJS where supported, browser bundling, and TypeScript declarations.

### Public documentation access

The repository root README becomes the navigation entry point:

```text
README.md
  -> five-minute hosted API quick start
  -> local development
  -> JavaScript/TypeScript SDK
  -> React integration
  -> public route reference
  -> architecture and security model
  -> contribution guide
```

Every package intended for direct use has a short README covering its purpose, installation, supported environments, public exports, and links to examples. Internal packages use `MODULE.md` to explain their interface and invariants without implying public support.

Generated OpenAPI and route reference are committed or published as deterministic build artifacts from `@linea/protocol`. The hosted documentation links to the exact version used by the deployed API. Notion may hold product planning, but public technical documentation lives with the code and is accessible without a Linea account.

### Local access to the complete system

A new contributor should be able to:

1. clone one repository;
2. run `pnpm install`;
3. copy `.env.example` without receiving production secrets;
4. start local Postgres and Redis;
5. run migrations;
6. start the API, workers, web app, and mobile development server;
7. run an example against the local API;
8. run scoped or repository-wide verification.

The root README and `CONTRIBUTING.md` must be updated before launch because their package and app inventory can drift. Optional integrations should degrade into explicit setup instructions rather than requiring private credentials for the default test suite.

### Open-source launch sequence

Keep the repository private through steps 1–9:

1. classify every tracked path as public source, generated artifact, local-only data, or secret;
2. scan the current tree and complete Git history for secrets and sensitive identifiers;
3. rotate every credential that was ever committed, even if later deleted;
4. audit dependency licenses, copied code, fonts, images, fixtures, and model-generated assets for redistribution rights;
5. replace production-like test data with synthetic fixtures and inspect database migrations for embedded data;
6. update README, CONTRIBUTING, SECURITY, package descriptions, repository links, and the project structure;
7. add CODEOWNERS, issue forms, pull-request template, code of conduct, support policy, and public roadmap labels;
8. harden GitHub Actions for untrusted forks and add branch, environment, and release protection;
9. build and install the repository from a clean clone using only documented public prerequisites.

Then:

10. create prerelease `0.x` versions of public packages using npm trusted publishing;
11. verify the hosted platform against those exact package and protocol versions;
12. enable GitHub private vulnerability reporting and organization security features;
13. change `linea-org/linea` visibility from private to public;
14. verify anonymous clone, documentation links, issue creation, package installation, examples, and security-reporting paths;
15. announce the supported surface precisely and avoid promising stability for internal packages.

Repository visibility is changed only after an explicit final approval accompanied by the audit report. Planning acceptance alone does not authorize the irreversible publication step.

### Release and protocol changes after launch

The normal change order remains inside one repository:

1. add a backward-compatible protocol schema or new operation;
2. implement it in the platform API;
3. add or update the SDK method and examples;
4. regenerate OpenAPI and route reference;
5. pass protocol, API, SDK, package, and integration checks in one PR;
6. deploy server support;
7. publish the stable package release;
8. deprecate older behavior only under the documented compatibility policy.

If publishing must precede deployment, publish a prerelease package and clearly mark the operation unavailable on stable hosted environments. Stable SDKs must not advertise a route that the production platform does not support.

### When a second repository would become justified

A private repository should be introduced later only for code that genuinely cannot be public, such as a separately licensed enterprise module or sensitive deployment automation. The public monorepo remains the canonical source for protocol and SDK contracts. A private repository consumes released public packages; it must not fork or privately redefine public types.

Do not split because a package is internal, contains security logic, or is not published to npm. Those are access and release properties, not sufficient reasons for a separate Git repository.

## Dependency direction

The intended dependency direction is:

```text
apps/web ---------> @linea/runtime
        ----------> @linea/protocol
apps/mobile ------> @linea/protocol
apps/platform-api -> @linea/protocol
        ----------> @linea/runtime
        ----------> @linea/db
apps/workers -----> @linea/runtime
        ----------> @linea/ai
        ----------> @linea/credentials
        ----------> @linea/db
        ----------> @linea/queue
@linea/sdk -------> @linea/protocol
@linea/sdk-react -> @linea/sdk/user
        ----------> @linea/protocol
```

Rules:

- packages never import from apps;
- protocol never imports runtime, persistence, queue, framework, or UI code;
- public SDKs never import database or queue types;
- applications may compose packages but may not become shared libraries;
- import-boundary checks should be enforced only after the target graph exists.

## One source for routes, SDKs, and documentation

Every public operation should be registered once with:

- stable `operationId` matching the SDK method name;
- plane and intended caller;
- HTTP method and versioned path;
- authentication mode and required scope;
- path, query, header, and body schemas;
- success status and response schema;
- stable error codes;
- idempotency requirements;
- pagination or event-resume behavior;
- rate-limit class;
- emitted events and webhook relationships;
- deprecation metadata when applicable.

From that registry, generate:

1. OpenAPI 3.1;
2. the public route reference;
3. SDK request/response typing inputs;
4. a coverage report mapping public operations to SDK methods;
5. API conformance tests that parse real responses;
6. examples that compile against the released SDK.

Do not generate the SDK implementation blindly from OpenAPI. The SDK is a deeper domain interface that may combine several transport operations, manage retries or DPoP nonces, and present safer names. Generate the mechanical contract and coverage checks; hand-write the small, coherent client interface.

## Route documentation template

Each public operation's generated page should include:

```text
Operation ID
Purpose
Plane and intended caller
Authentication and scopes
Method and path
Path/query/header parameters
Request schema
Success status and response schema
Stable errors and retryability
Idempotency behavior
Pagination or event resumption
Rate limits
Emitted events/webhooks
SDK method and import path
TypeScript example
cURL example where a server credential is safe
```

Handwritten guides should sit above the generated reference:

- server-side quick start;
- browser/native end-user quick start;
- OIDC with PKCE and DPoP lifecycle;
- Conversations and isolated thread storage;
- Approval Requests and Decisions;
- signed webhooks and delivery deduplication;
- error handling, retries, and idempotency;
- migration from the current `LineaClient`.

## Accepted future `/v1` protocol and SDK ownership

These operations are implemented incrementally in dependency order.

| Planned operation                                               | SDK owner                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /v1/applications/{applicationId}/executions`              | `@linea/sdk/server`                                                                |
| `POST /v1/applications/{applicationId}/subjects`                | `@linea/sdk/server`                                                                |
| `POST /v1/applications/{applicationId}/conversations`           | `@linea/sdk/server`                                                                |
| `GET /v1/executions/{executionId}`                              | `@linea/sdk/server` and safe user projection in `@linea/sdk/user` where authorized |
| `POST /v1/executions/{executionId}/cancel`                      | `@linea/sdk/server`                                                                |
| `GET /v1/applications/{applicationId}/events`                   | `@linea/sdk/server`                                                                |
| `GET /v1/applications/{applicationId}/webhook-deliveries`       | `@linea/sdk/server`                                                                |
| `POST /v1/user-sessions/authorization`                          | `@linea/sdk/user`                                                                  |
| `POST /v1/user-sessions/exchange`                               | `@linea/sdk/user`                                                                  |
| `POST /v1/user-sessions`                                        | `@linea/sdk/user`                                                                  |
| `POST /v1/user/executions`                                      | `@linea/sdk/user`                                                                  |
| `POST /v1/user/conversations`                                   | `@linea/sdk/user`                                                                  |
| `POST /v1/user/conversations/{conversationId}/messages`         | `@linea/sdk/user`                                                                  |
| `GET /v1/user/conversations/{conversationId}/messages`          | `@linea/sdk/user`                                                                  |
| `GET /v1/user/approval-requests`                                | `@linea/sdk/user`                                                                  |
| `GET /v1/user/approval-requests/{approvalRequestId}`            | `@linea/sdk/user`                                                                  |
| `POST /v1/user/approval-requests/{approvalRequestId}/decisions` | `@linea/sdk/user`                                                                  |
| `GET /v1/user/events`                                           | `@linea/sdk/user`                                                                  |

`@linea/sdk/webhooks` owns verification of outbound webhook envelopes rather than an inbound Linea route.

Every platform API route uses `/v1`. Only operations in the public registry are supported developer contracts; first-party routes share the namespace but may evolve with their applications.

## Conversation and prospect isolation

An External Subject is a person identity, not a Conversation. One External Subject can own any number of independent Conversations. Linea must never load or merge conversation history using only `externalSubjectId`.

The storage relationships should be:

```text
Workspace
  -> Application
    -> External Subject access
    -> Workflow binding and Contract revision
    -> Conversation
      -> Messages
      -> Executions
        -> Approval Requests
          -> Decisions
```

Each Conversation pins:

- workspace;
- Application;
- Workflow;
- External Subject;
- `dev` or `production` environment inherited from the Application;
- optional Application-scoped external thread key;
- optional bounded title and metadata;
- lifecycle timestamps and status.

The first write establishes that identity atomically. Later messages cannot change it. Continuing a thread requires its Conversation ID or its Application-scoped external thread key. Supplying only an External Subject ID is insufficient.

For an Operator tracking different prospects, cases, tickets, or chat topics for the same End User:

- use one Conversation per independent prospect or context;
- use `externalThreadKey` as the Operator's idempotent correlation key;
- store bounded prospect, case, or ticket identifiers in Conversation metadata;
- never treat metadata as identity, authorization, or automatic model input;
- reject reuse of an external thread key when Workflow, subject, or environment differs;
- never merge people by email, display name, metadata, or similar text.

Conversation history and long-term Memory are intentionally different:

- history is always keyed by `conversationId` and contains only that thread;
- Memory is keyed by External Subject plus an explicit namespace;
- sharing Memory across Conversations happens only when a Workflow requests that scope;
- behavior analysis is keyed to one Conversation and is eligible only in `production`;
- Approval Requests point to an Execution and subject, with an optional Conversation reference.

This permits deliberate personalization without accidentally combining separate prospects or threads.

## Approval and identity security

The earlier bearer conversation-token proposal is superseded. The accepted strong mode is:

1. The Operator configures an OIDC issuer on an Application through a recently reauthenticated workspace-admin session.
2. The End User authenticates client-side with Authorization Code and PKCE.
3. The End User's client sends its identity token directly to Linea.
4. Linea verifies issuer, audience, signature, expiry, and subject.
5. The client registers a non-extractable proof key.
6. Linea issues a short-lived opaque End-User Session bound to that key.
7. Protected requests carry DPoP proofs bound to method, URL, access token, nonce, timestamp, and unique proof ID.

An Operator backend may pre-provision a subject and start work for a provisioned or verified subject in its own Application. That authority does not authenticate the End User, create an End-User Session, or resolve an external-subject Approval Request. Only a valid End-User Session for the exact Application and subject can submit the Decision.

This resists a backend copying a bearer token and approving without the live client. It does not defend against an Operator that compromises its own identity provider or deliberately serves malicious frontend code. Stronger user-presence guarantees would require a Linea-hosted surface or technology such as WebAuthn and are separate work.

## Compatibility strategy

Package movement must not create a flag day.

- Keep the existing `LineaClient` root export during the first SDK restructuring.
- Add subpath exports without changing current method behavior.
- Move wire types to `@linea/protocol` internally, then re-export compatible public names.
- Add deprecation notices only after replacement methods exist and migration examples compile.
- Require at least one release cycle before removing a public export once customers exist.
- Move every platform API route under `/v1`, while treating only registry entries as explicit public contracts rather than promising dashboard routes as supported developer APIs.
- Do not rename durable Redis queues or database objects as part of package restructuring.
- Separate structural changes from product features so each PR has one reviewable concern.

## Verification and release gates

Every structural PR must run the repository-required lint, typecheck, format, and relevant tests. Additional gates should be introduced with the package they protect:

- protocol schema unit tests for accepted and rejected boundary values;
- API integration tests against real Postgres that parse responses with protocol schemas;
- cross-workspace, cross-Application, cross-subject, and cross-conversation isolation tests;
- SDK transport tests using an in-memory HTTP adapter;
- DPoP nonce, replay, clock-skew, expiry, and revocation tests;
- idempotency tests for duplicate and conflicting payloads;
- OpenAPI generation determinism;
- public-operation-to-SDK coverage checks;
- example projects that typecheck against packed package artifacts;
- package `exports` verification and `pnpm pack` smoke tests;
- browser bundle checks proving `@linea/protocol` and `@linea/sdk/user` contain no Node-only code.

The open-source decision makes publishing infrastructure a pre-launch requirement for `@linea/protocol` and `@linea/sdk`. Add provenance, release notes, a `0.x` semantic-versioning policy, packed-package verification, and an automated workflow protected by a release environment. Do not add release machinery for internal packages or placeholders.

## Proposed implementation sequence

Nothing in this section begins until this plan is approved and converted into separate issues and branches.

### Phase 0: agree on the contract

- Review this plan against the accepted protocol and current code.
- Decide which current routes are truly public, partner-only, or internal.
- Assign stable operation IDs to the public set.
- Decide the first real client integration that will validate the end-user slice.

Exit: one accepted route classification and no unresolved security-model conflict.

### Phase 1: establish `@linea/protocol`

- Create the browser-safe package.
- Move only public shared envelopes and the first route family into it.
- Adapt the relevant NestJS controller and current SDK method to the same schemas.
- Generate the first OpenAPI document and SDK coverage report.

Exit: one route family is defined once, validated by the API, consumed by the SDK, documented automatically, and tested through the public interface.

### Phase 2: restructure `@linea/sdk`

- Introduce `server`, `user`, and `webhooks` export seams.
- Preserve the current root `LineaClient` interface.
- Move transport, errors, pagination, and idempotency behavior behind the appropriate clients.
- Add compiled examples and packed-artifact tests.

Exit: old imports still work, new clients cannot accept the wrong credential class, and every implemented public operation has an SDK owner.

### Phase 3: isolate internal credentials and AI behavior

- Introduce `@linea/credentials` around the existing repeated credential-resolution behavior.
- Make `@linea/ai` consume that small internal interface.
- Keep database encryption and fallback details out of callers.
- Test through the credential interface with production and controlled test adapters.

Exit: security-sensitive credential behavior has one implementation and one test surface.

### Phase 4: enforce dependency direction

- Add import constraints only after packages have their final interfaces.
- Remove copied public wire types.
- Remove placeholders that still have no concrete role.
- Add release-readiness checks for packages intended to become public.

Exit: dependency violations fail CI, with no app-to-app or public-to-internal imports.

### Phase 5: implement the client-pulled end-user slice

Use the accepted delivery order from `docs/end-user-approval-protocol.md`, but begin only with the smallest complete slice required by the first integration. The eventual order remains:

1. shared protocol, errors, events, and idempotency;
2. Applications, Workflow Contracts, bindings, and Application keys;
3. External Subjects, OIDC PKCE, DPoP sessions, and revocation;
4. first-class Conversations and asynchronous end-user Executions;
5. Approval Requests, Decisions, safe display, races, and resume;
6. transactional outbox and deterministic queue delivery;
7. SSE reconciliation and signed webhooks;
8. SDK clients, headless React hooks, examples, and launch tests;
9. CopilotKit adapter after the headless interface is stable;
10. Connections and connector-enforced Action Consent as a later initiative.

Each item is a separate issue, branch, and PR. Adjacent work may run in parallel only when it consumes an already-merged contract and has no shared migration ownership.

## What is deliberately not being built now

- full Applications and identity infrastructure without a first external integration;
- Operator-asserted end-user identity;
- arbitrary third-party credential storage;
- Connections and Action Consent;
- CopilotKit-specific foundations before headless hooks work;
- full mobile Workflow authoring;
- offline approval Decisions;
- group approval, delegation, or cryptographic user presence;
- speculative packages with no real interface;
- public stability guarantees for internal dashboard routes.

The accepted architecture is retained so these capabilities can be built coherently when demanded. Deferral is sequencing, not rejection.

## Documentation consolidation and Notion

Use this file as the single Notion-ready implementation blueprint, but do not collapse every repository document into one permanent source. They answer different questions and change at different rates:

- `docs/product-vision.md` owns stable product identity and positioning;
- `docs/strategy.md` owns current market evidence, wedge, risks, and sequencing logic;
- `CONTEXT.md` owns canonical domain vocabulary only;
- `docs/adr/*` records hard-to-reverse accepted decisions and their trade-offs;
- `docs/end-user-approval-protocol.md` owns the detailed accepted security and protocol design;
- this file owns the package, developer-interface, documentation, and implementation plan.

`docs/sdk.md` contains the earlier Approval and conversation-token proposal. Its useful user stories should be retained, but its bearer-token, resolve-token, and confirmation-key security model is superseded by OIDC with PKCE, DPoP-bound End-User Sessions, and Decisions submitted only by the end-user plane. After this plan is approved, either replace `docs/sdk.md` with a short superseded notice linking to the accepted protocol or archive it in the same documentation-only PR. Do not leave both designs appearing current.

The Notion page should import this document and link back to the focused source documents. Generated route reference should eventually be published from `@linea/protocol`; it should not be manually copied into Notion because that copy will drift.

## Decisions required before implementation

1. Which existing routes, if any, become supported public `/v1` operations beyond the accepted end-user protocol?
2. Is the first external integration server-triggered, end-user-triggered, conversational, approval-based, or a smaller combination?
3. Which identity provider will be used for the first OIDC and DPoP launch test?
4. What compatibility window will apply to the current root `LineaClient` after real customers exist?
5. Where will generated OpenAPI and route reference be hosted when deployment begins?
6. Which organization teams will own protocol, SDK, runtime, security, platform, architecture, and release paths?
7. Which repository history findings, if any, require rotation or removal before visibility changes?

Until these are answered, implementation should stop at reversible structural work with immediate current callers. The full protocol remains the destination, not an instruction to build every layer speculatively.

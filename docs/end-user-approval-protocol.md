# End-User Approval Protocol

Status: accepted design. Implementation tickets may now be rewritten from this protocol.

## Purpose

Linea should let an operator build arbitrary applications on top of published workflows while allowing the operator's own end users to make human decisions and control access to their external APIs. The protocol must work for chat, forms, dashboards, native applications, background jobs, and interfaces Linea does not provide.

This document replaces the external-subject approval architecture in issue #84. The operator mobile application remains a related but separate workspace-member surface.

## Goals

- Expose approvals as a headless protocol rather than a Linea-owned UI flow.
- Let an operator's end user approve or reject without becoming a Linea workspace member.
- Prevent one external subject from reading or deciding another subject's requests.
- Support custom browser, mobile, server-rendered, and non-React applications.
- Give clients reliable event delivery, reconciliation, retries, and stable errors.
- Resume a paused execution exactly once when a valid decision wins a race with timeout.
- Let an end user connect, constrain, inspect, and revoke credentials for external services.
- Bind consent for an external side effect to the exact operation and parameters executed.
- Keep workspace-member approvals working as they do today.

## Non-goals

- Making an external subject a Linea workspace member.
- Exposing arbitrary execution internals, node configuration, or node input to an end user.
- Treating CORS as an authentication mechanism.
- Claiming that a bearer token delivered through an operator backend proves a real human participated.
- Using a workflow-authored Approval node as the sole enforcement mechanism for access to an end user's external credentials.
- Making every workflow conversational.

## Accepted Foundations

- Linea will resist approval of an existing request by a compromised Operator backend while continuing to trust the Operator's separately operated identity provider and acknowledging that Operator-controlled frontend code remains outside the guarantee.
- Application is a first-class resource with its own identity configuration, origins, exposed workflows, webhooks, and policies.
- Workflow Approval and connector-enforced Action Consent are separate controls that share the Approval Request and Decision protocol.
- Headless external-subject approvals ship before Connections and Action Consent, but the first milestone preserves the Action Intent linkage needed by the second.
- CopilotKit is an adapter over the headless end-user interface and React hooks, not their foundation.
- Issue #84 remains the parent initiative. Closed historical issues retain their shipped meaning, open superseded issues close with replacement links, and new protocol work receives new GitHub-assigned issue numbers.
- The first release requires client-side OIDC Authorization Code with PKCE; Operator-backend identity assertions are deferred as a weaker mode.
- One Application represents one deployed security boundary and pins exactly one `dev` or `production` environment.
- End-user live events use SSE, backed by an authoritative list endpoint and polling fallback.
- A timeout produces the configured approve or reject Decision attributed to the timeout system; it does not create a separate expired outcome.
- Workflow authors define a validated title, description, and labeled detail projection that Linea resolves and snapshots for display.
- Any current End-User Session for the same External Subject and Application may decide that subject's Approval Request; ownership is not tied to the initiating browser session.
- End-User Sessions have a 15-minute absolute lifetime and are renewed through a fresh client-side OIDC exchange; Linea does not issue refresh tokens in the first release.
- Both Operator backends and End Users may start work through separate authorization paths, but only an End-User Session may submit an external-subject Decision.
- External Subject identity is canonical within one workspace and issuer while data access remains Application-scoped by default.
- One Conversation belongs to exactly one Workflow; workflow routing inside a Conversation uses branches and subworkflows.
- A Conversation does not pin a Workflow version; each new Execution uses and records the latest version published when it starts.
- Operators may distinguish an End User's threads with an Application-scoped external thread key, title, and bounded metadata that never acts as identity or implicit model input.
- Cancelling an Execution cancels its pending Approval Request; requests from different Executions never supersede one another automatically.
- External-subject Approval Requests belong to exactly one External Subject in the first release, with no delegation, quorum, or group approval.
- Connections are Application-scoped. Reads are allowed within granted provider scopes, while every write or side effect requires consent to its exact Action Intent in the first Connections release.
- End-User Sessions use standard DPoP proofs and revocable server-side state; identity-provider logout takes effect at the next exchange while current exposure remains capped at 15 minutes.
- Each External Subject receives one Application-level SSE stream with seven days of resumable events and list-based reconciliation after cursor expiry.
- End-user content retention is Application-owned, while behavior-analysis enablement remains workspace-owned and production-only.
- Operators can inspect their workspace audit history and End Users can inspect their own approval, Connection, and action history through different projections.
- Public rate, concurrency, pending-request, and payload limits are explicit protocol behavior.
- The first Connections release accepts OAuth only and proves the connector model through Gmail, Google Calendar, and GitHub action families before extracting a generic connector interface.
- End-User Session access tokens are opaque, stored hashed, and resolved through revocable server-side session state.
- Approval Requests and their immutable, one-to-one Decisions are separate records.
- Decision comments are bounded untrusted output available to the resumed Workflow but never implicitly treated as instructions.
- Action Consent always rejects on timeout and refuses stale provider state; it never inherits generic Approval auto-approve behavior.
- Disabling an External Subject immediately revokes access, while erasure removes identifying content and retains only pseudonymous audit evidence.
- A shared `packages/protocol` module owns public wire schemas, error codes, and event envelopes without owning the higher-level SDK interface.
- Public webhooks use a versioned minimal envelope and the accepted initial execution, approval, action, and Connection event catalog.
- Operator backends may pre-provision an issuer subject and start work for it, but only direct OIDC exchange verifies the subject and grants Decision authority.
- The schema moves forward without runtime compatibility: existing development Conversations and Approval Decisions are backfilled, while inconsistent local data fails loudly and may be reset.
- Postgres outbox rows are authoritative for committed resume and event work; deterministic BullMQ jobs accelerate idempotent delivery.
- Every platform API route is versioned under `/v1`; registry membership, not the path prefix, distinguishes supported public operations from first-party routes.
- External-subject approvals do not launch until the accepted real-identity, isolation, race, recovery, event, webhook, and SDK gates pass.
- Public server keys use explicit scopes and can never alter Application identity/security configuration, create keys, change their own authority, or decide external-subject Approval Requests.
- Each Application exposes published Workflows through explicit bindings that independently allow backend and End-User starts.
- A binding pins an immutable public Workflow Contract revision while each Execution selects the latest compatible published implementation.
- End Users see only Execution identity, status, Conversation identity, contract-validated public output, safe errors, and their Approval Requests.
- Application-bound and workspace-bound server credentials have separate clients and authority; an Application key can never cross its Application even when it has the same named scope as a workspace key.
- Public Execution starts are asynchronous and idempotent, Application backends may cancel their own Executions, and End Users cannot cancel Executions in the first release.
- The accepted dependency graph uses named workstreams rather than reassigning historical issue numbers. Mobile issues #91-#93 remain a separate chain and are relinked to the new Approval Request work.

## Current System

- `approvals` supports only Linea workspace members. Eligibility is enforced from live workspace membership and `approverEmails`.
- `respondedBy` references a Linea `users.id`; there is no external-subject decision actor.
- `externalSubjectId` is a caller-supplied attribution value, not a verified identity.
- Conversations are inferred from grouped `chat_messages`; there is no first-class conversation record that pins application, subject, environment, or lifecycle.
- Chat Preview is a builder-only draft flow, not a production end-user interface.
- `executionEnvironment` belongs to each execution and already distinguishes `draft`, `dev`, and `production`.
- `@linea/sdk` is a server-only client authenticated by a workspace-wide API key.
- `@linea/sdk-react` is currently a stub.
- Approval creation, execution pausing, timeout resolution, and queue publication already contain useful race-handling machinery, but there is no external-subject protocol or durable public event channel.

## Language

The following accepted terms are also recorded in `CONTEXT.md`.

### Operator

A Linea workspace customer that authors and operates workflows.

### Application

One product or deployed client through which an Operator exposes Linea-backed behavior to End Users. It owns identity configuration, allowed browser origins, and end-user access policy.

### End User

A person using an Operator's Application. This is the product-facing term.

### External Subject

Linea's workspace-scoped representation of an End User. It is not a Linea account or workspace member.

### End-User Session

A proof-bound capability through which an End User interacts with Linea from an Application. It has a 15-minute absolute lifetime and is replaced through a fresh identity exchange rather than refreshed by Linea.

### Conversation

An optional ordered exchange associated with an Application, External Subject, Workflow, and environment. Approval must not require a Conversation because many workflows are not chat based.

### Approval Request

A durable request for a human decision that pauses an Execution until it receives a human or timeout Decision or is cancelled.

### Decision

An immutable approve or reject response to an Approval Request, attributed to a workspace member, External Subject, or the timeout system.

### Connection

An End User's encrypted credential relationship with an external service, such as Google, GitHub, or Stripe.

### Action Intent

An immutable description of one proposed external side effect, including the Connection, operation, target, and parameters.

### Action Consent

An End User's authorization of one exact Action Intent or an explicit policy that covers it.

## Architectural Principle: Two Planes

### Control Plane

The Operator uses three distinct authorities:

- an interactive workspace-admin session with recent reauthentication creates Applications and keys and configures identity issuers, allowed origins, webhooks, and Connection policy;
- an Application backend uses an Application Key to provision External Subjects, manage Conversations, start or cancel Executions on their behalf, and observe that Application's events;
- workspace automation uses a Workspace Key for its explicitly scoped Workflow, Signal, and cross-Application monitoring operations.

No server credential may resolve an Approval Request whose audience is an External Subject.

Identity issuers, JWKS configuration, allowed origins, DPoP policy, and API-key creation or scope changes require an interactive workspace-admin session with recent reauthentication. A compromised Operator backend must not be able to replace the identity trust anchor and mint itself an approver session.

### End-User Plane

An End User's browser or native client uses an End-User Session to:

- start only workflows exposed by its Application;
- send and read messages in its own Conversations;
- list and subscribe to its own Approval Requests;
- submit Decisions;
- create, inspect, constrain, and revoke its own Connections and consent policies.

An End-User Session must never grant workspace administration, arbitrary workflow execution, or access to other subjects' data.

## Identity and Threat Model

### Problem with the previous design

Issue #84 proposed minting a bearer conversation token in response to an Operator backend request and then passing that token to the frontend. The backend sees the same credential as the frontend and can copy it. Client-direct HTTP does not change that fact, so the design cannot claim that a compromised backend is unable to approve.

The proposed `confirmations` API-key purpose also conflicts with the stated rule that platform API keys cannot resolve external-subject approvals. Rate limiting per API key is incoherent on an endpoint authenticated by an End-User Session.

### Recommended strong mode

1. The Operator registers an OIDC issuer, client identifier, audience, JWKS URL, subject claim, redirect origins, and allowed browser origins on an Application.
2. The End User's browser or native client signs in through the Operator's identity provider using Authorization Code with PKCE.
3. The End User's client sends the resulting identity token directly to Linea; the authorization code, PKCE verifier, and token never transit the Operator backend.
4. Linea verifies issuer, audience, signature, expiry, and subject.
5. The client generates a non-extractable key and registers its public-key thumbprint during session exchange.
6. Linea derives the External Subject from the verified issuer and subject claim.
7. Linea issues an access token bound to the client key thumbprint and a revocable server-side session record.
8. Each protected request carries a standard DPoP proof bound to method, URL, access token, timestamp, server nonce, and unique proof identifier.

This prevents an Operator backend from copying a Linea bearer token and replaying it from the server. The guarantee depends on the identity token and PKCE verifier remaining client-side. It does not protect against an Operator that compromises its identity issuer or deliberately serves malicious frontend code. Defending against the Operator-controlled UI requires a Linea-hosted confirmation surface or a user-presence mechanism such as WebAuthn.

### Deferred weaker mode

Linea may later support an Operator-asserted External Subject for applications without an identity issuer. It is not part of the first release. That mode trusts the Operator backend for identity and must be named and documented as such. It cannot make the compromised-backend-resistance claim.

### Revocation and identity-provider logout

- A session, External Subject, or Application can be disabled immediately in Linea.
- Proof identifiers are retained for the session lifetime so the same DPoP proof cannot be replayed.
- Identity-provider logout does not retroactively revoke an already-issued Linea session unless the provider supplies a reliable revocation signal.
- The remaining exposure is bounded by the 15-minute absolute session lifetime.
- A new exchange after identity-provider logout fails when the provider no longer authorizes it.

### Access-token representation

The End-User Session access token is opaque, high entropy, and visibly distinguished from workspace keys with its own prefix such as `lnu_`. Linea stores only its hash. The session row owns Application, External Subject, proof-key thumbprint, expiry, revocation state, and last-use timestamps. Public clients never inspect token claims; every protected request resolves current authorization from server-side state.

## First-Class Applications and Conversations

An Application is required because one workspace may expose several products and deployments with different issuers, origins, workflows, and policies. One Application represents one deployed security boundary and pins exactly one `dev` or `production` environment. Staging and production are separate Applications; `draft` is reserved for Linea builder surfaces.

A production Conversation must become a first-class record rather than an aggregation over messages. An External Subject owns many Conversations; Linea never derives a Conversation by grouping every message for that subject. Each Conversation is one independent thread or context and pins:

- workspace;
- Application;
- Workflow;
- External Subject;
- execution environment;
- lifecycle timestamps.

The first write establishes these values atomically. Later messages cannot change them. `chat_messages` references the Conversation rather than independently repeating identity and environment as authority.

Non-chat executions carry the Application and External Subject directly without creating a Conversation.

### Relational model

```text
workspaces
  └── applications
        ├── external_subjects
        │     └── conversations
        │           ├── chat_messages
        │           ├── executions
        │           └── approval_requests
        └── webhooks
```

`external_subjects` identifies a person without conflating them with a thread:

```text
id
workspace_id
issuer_id
issuer_subject
created_at
updated_at
UNIQUE (workspace_id, issuer_id, issuer_subject)
```

The same verified person may use several Applications backed by the same issuer while remaining one External Subject inside that workspace. Cross-workspace identities never merge. Conversations, Connections, events, and access remain Application-scoped by default. An Operator may later choose an explicit subject-linking flow for identities from different issuers; Linea must not guess that two issuer subjects are the same person.

An Operator backend may pre-provision an External Subject from the Application's configured issuer and stable subject identifier before that person authenticates. The subject begins `provisioned`; the backend may start work and create pending requests but cannot create a session or decide them. The first successful direct OIDC exchange for the same issuer and subject changes it to `verified` and makes pending requests visible to that End User.

`conversations` identifies one independent thread:

```text
id
workspace_id
application_id
workflow_id
external_subject_id
external_thread_key nullable
title nullable
metadata nullable
environment
status
last_activity_at
created_at
updated_at
UNIQUE (application_id, external_thread_key) WHERE external_thread_key IS NOT NULL
UNIQUE (id, workspace_id)
```

Linea generates `id`. `external_thread_key` is an optional idempotent correlation key supplied by the Operator, such as its own chat thread ID. It is namespaced by Application, so identical keys in staging, production, or another product do not collide. `title` is a bounded display label. `metadata` is bounded Application data for identifiers such as prospect, case, or ticket IDs; it is never identity, authorization input, or automatically supplied to a model.

Creating a Conversation with an existing `(application_id, external_thread_key)` returns the existing Conversation only when Workflow, External Subject, and environment match. A mismatch returns `conversation_identity_conflict`; it never silently reassigns the thread.

`chat_messages` stores turns for exactly one Conversation:

```text
id
workspace_id
conversation_id
client_message_id
execution_id nullable
responds_to_message_id nullable
sequence
role
content
created_at
UNIQUE (conversation_id, client_message_id)
```

`client_message_id` makes a retried send idempotent. `sequence` remains the durable ordering key within a Conversation. Message queries always require both workspace and Conversation scope internally, even when the public client exposes only the opaque Conversation ID.

An Execution references `conversation_id` when it represents a turn and independently snapshots `application_id` and `external_subject_id` for authorization, audit, and non-chat consistency. The database or repository transaction verifies that all four records belong to the same workspace and subject. Caller-controlled workflow payload is never the authority for these relationships.

### Isolation rules

- One External Subject can have any number of Conversations.
- One Conversation belongs to exactly one Application, Workflow, External Subject, and environment for its lifetime.
- One Conversation invokes exactly one Workflow; branches and subworkflows provide routing inside it.
- A Conversation does not pin one Workflow version. Each new Execution uses the latest version published at its own start and records that immutable version.
- Starting a new topic, prospect, case, ticket, or chat creates a new Conversation or uses a different `external_thread_key`.
- Continuing a thread requires its Conversation ID or external thread key; an External Subject ID alone is insufficient.
- Listing Conversations is filtered by the authenticated External Subject and Application.
- Fetching Messages, Approval Requests, or events verifies the same subject and Application in the query that reads them.
- Analytics processes each Conversation separately. It never concatenates every message belonging to an External Subject.
- Retention deletes or redacts per Conversation without corrupting another thread's history.

### Memory is deliberately separate

Conversation history and long-term Memory have different scope:

- Conversation history is keyed by `conversation_id` and contains only that thread.
- Long-term Memory is keyed by External Subject plus an explicit namespace and may be shared across Conversations only when the workflow intentionally requests it.
- Approval Requests are keyed to an Execution and External Subject, with an optional Conversation reference for discovery and display.
- Behavior analysis is keyed to one Conversation and its environment.

This prevents accidental merging while still allowing an Operator to build deliberate cross-conversation personalization through Memory.

### Concurrent creation

Conversation creation and the first Message use a transaction and a lock or unique constraint on `(application_id, external_thread_key)`. Two simultaneous first requests therefore create one Conversation or receive a deterministic conflict; they cannot establish different subjects under the same external thread key.

### Existing data migration

The current system derives conversations from `(workspace_id, workflow_id, conversation_id)` on `chat_messages`. A forward migration:

1. creates Applications, identity issuers, first-class Conversations, External Subject identity links, End-User Sessions, Approval Requests, Approval Decisions, and outbox records;
2. creates one internal builder Application per workspace;
3. creates one `draft` Conversation for each existing message tuple and attaches its Messages and linked Executions;
4. renames `approvals` to `approval_requests`;
5. converts resolved Approval fields into immutable Decision rows;
6. adds constraints only after the backfill succeeds.

There is no runtime compatibility layer. Because the product has not been deployed, inconsistent development rows fail migration loudly and developers may reset their local databases rather than preserve ambiguous state.

## Proposed Public Protocol

The exact paths are provisional, but the resource model and authorization split are not.

Every platform API endpoint lives under `/v1`. Only operations in the public registry are compatibility contracts; first-party dashboard endpoints share the versioned namespace without becoming public. The server SDK, user SDK, webhooks, generated OpenAPI description, and third-party Applications consume only registered public operations.

### Server endpoints

```http
POST /v1/applications/{applicationId}/executions
POST /v1/applications/{applicationId}/conversations
GET  /v1/executions/{executionId}
POST /v1/executions/{executionId}/cancel
GET  /v1/applications/{applicationId}/events
GET  /v1/applications/{applicationId}/webhook-deliveries
```

These endpoints require an Application key with the necessary scopes, and every resource must belong to that key's Application. Creating an Execution for an External Subject does not grant the caller authority to decide that subject's Approval Requests.

### Public server-key authorization

The current broad `apiKeyPurpose` model is replaced for `/v1` by explicit scopes. Initial scopes are:

- `subjects:provision`;
- `executions:read`;
- `executions:start`;
- `executions:cancel`;
- `conversations:read`;
- `conversations:write`;
- `events:read`;
- `webhooks:read`.

There are two server credential boundaries:

- an Application key is bound to exactly one Application and supports subject provisioning, Conversations, Execution start/read/cancel, events, and webhook-delivery inspection for that Application;
- a workspace key supports Workflow, Signal, and cross-Application monitoring operations explicitly granted to the workspace client, but cannot be substituted for an Application key on the end-user runtime surface.

Matching scope names do not remove the resource boundary. No server key may alter identity issuers, JWKS configuration, allowed origins, DPoP policy, its own scopes, or other keys. No server key may submit an external-subject Decision. Security-sensitive Application configuration and credential creation require a workspace-admin session and recent magic-link or OIDC reauthentication.

### Application Workflow exposure

An Application exposes a published Workflow only through an explicit binding containing:

- Workflow ID;
- public Workflow Contract revision;
- `allowBackendStart`;
- `allowEndUserStart`;
- enabled state.

Both public server-key and End-User Session starts must resolve an enabled binding. Possession of a Workflow ID alone grants nothing. A disabled binding blocks new work without changing already-running Executions or historical records.

### Public Workflow Contracts

Start and End nodes currently accept unknown values, which is not a safe third-party interface. A versioned Workflow Contract defines public input and output through JSON Schema. Contract revisions are immutable.

An Application binding pins a contract revision, not an implementation version. Each newly published Workflow implementation must conform to that contract before it can serve the binding. A compatible implementation becomes available to new Executions automatically; every Execution records the implementation version it selected. A breaking input or output change creates a new contract revision and requires explicit Application rebinding.

The public protocol validates incoming payloads and outgoing public results against the bound contract. Internal node data is never used as an implicit public result.

### Session exchange

```http
POST /v1/user-sessions/exchange
```

Input:

```json
{
  "applicationId": "app_123",
  "identityToken": "operator-issued JWT",
  "proofKey": "public JWK"
}
```

Output:

```json
{
  "sessionToken": "short-lived token",
  "expiresAt": "2026-09-06T12:00:00Z",
  "subject": { "id": "subject_123" }
}
```

The raw issuer subject should not become a globally meaningful identifier. Linea resolves it within the workspace and issuer namespace.

### End-user workflow and conversation endpoints

```http
POST /v1/user/executions
POST /v1/user/conversations
POST /v1/user/conversations/{conversationId}/messages
GET  /v1/user/conversations/{conversationId}/messages
```

An Application allowlist determines which published workflows an End-User Session may start. An End-User start inherits its Application's pinned environment: a `dev` Application creates a `dev` Execution and a `production` Application creates a `production` Execution. The caller cannot select or override the environment, and `draft` remains exclusive to Linea builder surfaces.

Both planes may start work:

- an End-User Session may start only a Workflow exposed by its Application;
- an Operator backend may start an Execution or Conversation for a provisioned or verified External Subject in its Application;
- a backend-started Approval Request becomes visible to that subject's current or future End-User Sessions in the same Application;
- starting work never grants the Operator backend authority to submit the resulting Decision.

All mutating requests require an idempotency key so the browser SDK can retry after an ambiguous network failure without creating a duplicate execution, message, or Decision.

### Asynchronous Execution lifecycle

Every endpoint that starts an Execution returns HTTP 202 with the End-User or Operator projection of the new Execution and a `Location` header for its authoritative read endpoint. Completion is observed through SSE, polling, or a signed webhook; a start request never holds an HTTP connection open for Workflow completion.

Repeating a start with the same idempotency key returns the same Execution. Reusing that key with different input returns `idempotency_conflict`.

An Application backend with `executions:cancel` may cancel a nonterminal Execution only when it belongs to the key's Application. Cancellation is idempotent, records the server-key actor, stops future runnable work, and atomically cancels any pending Approval Request. It cannot reverse an external side effect that already completed. End-User Sessions do not receive Execution-cancellation authority in the first release; an End User rejects a pending request when they do not want the proposed action to continue.

### Approval endpoints

```http
GET  /v1/user/approval-requests?status=pending&conversationId={optional}
GET  /v1/user/approval-requests/{approvalRequestId}
POST /v1/user/approval-requests/{approvalRequestId}/decisions
GET  /v1/user/events
```

Decision input:

```json
{
  "decision": "approved",
  "comment": "Looks correct"
}
```

The Decision endpoint requires the End-User Session, client proof, and an idempotency key.

Any current End-User Session for the same External Subject and Application may decide the request. The initiating session is recorded when available but is not the authorization owner. The Decision audit record captures the exact session that acted.

An optional Decision comment is plain text capped at 2 KiB. It is stored on the immutable Decision and returned as explicitly untrusted Approval-node output to the resumed Workflow. Linea escapes it in every owned renderer and never automatically inserts it into model prompts, Action Intents, webhook headers, or logs.

### Stable errors

Public clients receive stable machine codes in addition to readable messages:

- `approval_request_expired`;
- `approval_request_already_decided`;
- `approval_request_wrong_subject`;
- `approval_request_cancelled`;
- `decision_conflict`;
- `session_expired`;
- `session_revoked`;
- `proof_invalid`;
- `idempotency_conflict`;
- `execution_not_cancellable`.

HTTP status and error-code behavior is part of the public interface and must be covered by contract tests.

### End-user Execution projection

An End User may read only:

- Execution ID and status;
- Conversation ID when present;
- declared public output validated by the bound Workflow Contract;
- stable public error code and sanitized message;
- Approval Requests belonging to that External Subject and Application.

Node configuration, step inputs or outputs, prompts, provider responses, internal errors, cost, retries, leases, and execution timelines are Operator-only data.

## Approval Request Data

An Approval Request needs enough durable state to authorize and explain a Decision without exposing the complete workflow:

- workspace, Application, Workflow, Execution, and node identifiers;
- audience: `workspace` or `external_subject`;
- External Subject for the external audience;
- optional Conversation;
- status and monotonic version;
- safe display snapshot;
- requested, expiry, and cancellation timestamps;
- timeout action;
- optional Action Intent digest.

Approval persistence is split into two records:

- `approval_requests` contains the mutable lifecycle state `pending`, `decided`, or `cancelled`, ownership, display snapshot, timeout configuration, Action Intent digest, and resource relationships;
- `approval_decisions` is an immutable one-to-one record containing `approved` or `rejected`, actor kind, the applicable actor identifier, End-User Session when present, reason, comment, idempotency key, and decision timestamp.

A unique constraint permits only one Decision per Approval Request. The request's decided state and the Decision insert occur in the same transaction.

The existing `respondedBy` meaning remains a Linea user foreign key during migration. External-subject attribution belongs in a separate field; the two identities are not polymorphic values in one column.

## Safe Display Contract

External clients must not receive arbitrary node input, resolved node configuration, secrets, or execution steps. The workflow author provides an explicit display projection:

```json
{
  "title": "Send refund?",
  "description": "Refund $49.00 to card ending 4242",
  "details": {
    "customer": "Jane",
    "amount": "$49.00"
  }
}
```

Linea validates size and shape and snapshots it when the Approval Request is created. A later workflow edit cannot change what the End User is recorded as having approved.

The Approval node should derive the External Subject from trusted execution context. A `subjectPath` through arbitrary node input is appropriate for data partitioning in the current Memory node but is not an authorization source. If the execution has no authenticated External Subject, an external-subject Approval node fails loudly.

## Atomic Decision and Resume

One internal Approval module should own the complete transition behind a small interface:

- request an approval;
- decide an approval;
- expire the next due approval.

A successful Decision transaction must:

1. lock the pending Approval Request;
2. verify audience, External Subject, session, client proof, expiry, and status;
3. enforce the idempotency key;
4. record the immutable Decision and audit entry;
5. transition the paused Execution back to queued;
6. write an outbox event.

Queue publication and external event delivery happen from the outbox. A process crash after commit must not strand the Execution or lose the event.

Postgres is authoritative for committed delivery work. A background dispatcher claims outbox rows and publishes deterministic BullMQ jobs using the event ID as `jobId`. Resume, webhook, SSE fan-out, notification, and later connector consumers are idempotent. Completion and retry state remain visible on the outbox or delivery record. BullMQ is an accelerator and work-distribution mechanism, not the only record that an event must occur.

The timeout poller uses the same locked transition. Exactly one of Decision or timeout wins. The loser receives the actual terminal state.

An exact retry with the same idempotency key and body returns the original successful result. Reusing the key with a different body returns `idempotency_conflict`. This is safer for application developers than treating every retry as a hostile replay.

### Cancellation and supersession

- Cancelling an Execution atomically changes its pending Approval Request to `cancelled` and emits the corresponding event.
- A cancelled request rejects every later Decision.
- End Users reject requests; they do not cancel Executions in the first release.
- Approval Requests from different Executions never supersede one another automatically, even when their display snapshots look alike.
- Replacing a request requires explicit cancellation of its Execution and creation of a new Execution and request.

### One external approver

An external-subject Approval Request belongs to exactly one External Subject. Any current session for that subject and Application may decide it, but another subject may not. Group Conversations, delegation, quorum, transferable requests, and lists of eligible external subjects are deferred. Workspace-audience approvals retain their existing multiple-member behavior.

## Event Delivery

### End-user clients

- Server-Sent Events are the live transport and provide resumable event IDs.
- Listing pending Approval Requests is the required reconciliation path.
- Polling the list endpoint is a supported fallback.
- Events contain identifiers and safe display data only.
- One stream covers the authenticated External Subject's events across the Application, with optional Conversation and event-type filters.
- Events remain resumable for seven days.
- A cursor older than retained history returns `event_cursor_expired`; the SDK lists current state and reconnects without that cursor.
- Browser clients consume SSE over streaming `fetch`, not native `EventSource`, because the request must carry Authorization and DPoP headers.

### Operator backends

- Signed webhooks are informational and cannot resolve an external-subject request.
- Delivery is at least once from the transactional outbox.
- Each event has a stable event ID so receivers can deduplicate.
- Retries use bounded exponential backoff and retain inspectable delivery status.
- HMAC signatures cover timestamp, event ID, and exact body bytes.
- Secret rotation retains a bounded previous-secret grace window.
- Webhook destinations require SSRF protection and HTTPS outside local development.

There is no resolve token in a webhook. The prior resolve-token design had no coherent route from webhook to browser and gave the Operator backend another apparent approval credential.

## End-User Control of External APIs

### Why the Approval node is insufficient

A workflow author controls whether an Approval node exists and can route around its output. Therefore it cannot be the security mechanism that protects an End User's Google, GitHub, Stripe, or other credentials.

### Connections

An End User creates a Connection through the End-User Plane. Linea stores provider credentials encrypted and scoped to workspace, Application, External Subject, and provider account. Credentials never enter workflow payloads, node outputs, logs, or approval display data.

Connections are not shared across Applications in the first release. Shared External Subject identity does not imply permission to reuse staging credentials in production or one product's credential in another product. A future sharing flow requires an explicit End-User grant.

The End User can:

- inspect connected provider and account identity;
- inspect granted provider scopes;
- revoke a Connection;
- review recent uses;
- configure supported consent policy.

### Action Intents

Before a protected tool performs a side effect, the tool execution layer constructs and stores an immutable Action Intent containing:

- Connection;
- connector and operation;
- target resource;
- canonical parameters;
- human-readable safe display projection;
- canonical digest;
- idempotency key.

An Action Consent authorizes the digest, not a generic message. After approval, the connector executes the stored Action Intent. It may not recompute mutable parameters from the resumed workflow. Changing recipient, amount, repository, operation, or any other protected parameter creates a new digest and requires a new consent decision unless an existing policy explicitly covers it.

Read/write classification and consent policy are enforced by the connector/tool gateway, not by workflow branching.

The first Connections release uses a deliberately strict policy:

- reads are allowed when covered by the provider's granted OAuth scopes;
- every write or side effect creates an Approval Request for its exact Action Intent;
- no persistent always-allow rules exist;
- a later policy release may add bounded grants for one operation, resource set, constraints, and expiry.

Action Consent has stricter timeout behavior than a generic workflow Approval Request. It always creates a rejected system Decision on timeout and can never auto-approve a side effect. Connector adapters capture provider preconditions when constructing an Action Intent. If the target resource changes before execution, the connector returns `action_intent_stale`, performs no side effect, and requires a new Action Intent and consent.

### First credential and connector coverage

The first release accepts provider OAuth grants only. It does not accept arbitrary API keys, bearer tokens, or generic Operator-defined OAuth configuration.

Three concrete action families establish the repeated shapes needed before a shared connector interface is extracted:

1. Gmail read and send;
2. Google Calendar read and create/update;
3. GitHub repository and issue reads plus issue or pull-request creation.

The Google action families may share provider authorization implementation, but their Action Intent and consent presentation remain operation-specific.

## Retention

End-user data retention belongs to the Application because Applications are deployed security and compliance boundaries:

- Conversation Messages, safe display snapshots, titles, and metadata default to 30 days and are configurable per Application;
- the Approval Decision and security audit envelope is retained for one year without expired display content;
- a Connection exists until revoked, after which provider credentials are deleted promptly while a redacted audit record remains;
- builder-only `draft` data and `dev` Application data follow separate internal-development retention;
- behavior-analysis enablement remains a workspace setting but selects only production Conversations.

This supersedes the earlier proposal to place all retention behavior in `workspace_settings`.

## Audit Visibility

Operators can inspect all Application and workspace audit events. End Users can inspect only their own Approval Requests, Decisions, Connection changes, and Action Intent executions. End-user projections never expose other subjects, workflow internals, credentials, secrets, raw webhook deliveries, internal retries, or tokens. Every audit projection uses stable identifiers and redacted summaries.

## External Subject Lifecycle

Disabling an External Subject immediately revokes its End-User Sessions and Connections and cancels its pending Approval Requests. An End User can revoke an individual Connection directly; the Operator, as data controller, initiates full identity erasure.

Erasure removes Conversation content, titles, metadata, approval display snapshots, and other identifying attributes. Security and Decision audit records retain only a new pseudonymous subject reference for the configured audit lifetime. Subjects from different issuers never merge automatically. Issuer migration requires either proof of both identities or an explicit, audited workspace-admin migration.

## Shared Wire Contract

`packages/protocol` owns the Zod schemas for public request and response bodies, resource projections, event envelopes, enums, and stable error codes. The platform API, server SDK, user SDK, generated OpenAPI document, contract tests, React hooks, and mobile adapters consume those schemas.

The package does not expose database rows or internal module types. SDK methods remain deliberately hand-written around the protocol rather than generated wholesale, preserving a small caller interface instead of leaking every server route into application code.

## Webhook Event Contract

Every webhook uses a versioned envelope containing `id`, `type`, `version`, `createdAt`, `applicationId`, and minimal resource data. The initial event catalog is:

- `execution.completed`;
- `execution.failed`;
- `approval_request.created`;
- `approval_request.decided`;
- `approval_request.cancelled`;
- `action_intent.executed`;
- `action_intent.failed`;
- `connection.revoked`.

Webhook delivery logs remain available to Operators for 30 days. Event IDs are stable across retries, delivery is at least once, and a payload-breaking change requires a new envelope version. Tokens, credentials, arbitrary workflow input, and unredacted provider responses are forbidden in webhook payloads.

## Public Limits

The first protocol publishes conservative defaults:

- 10 session exchanges per minute per Application and network address;
- 60 Messages per minute per End-User Session;
- 10 new Executions per minute per External Subject;
- 10 Decision attempts per minute per session and 5 per minute per Approval Request;
- 3 simultaneous SSE streams per External Subject and Application;
- 100 pending Approval Requests per External Subject and Application;
- 16 KiB Message content;
- 8 KiB approval display snapshot;
- 8 KiB Conversation metadata;
- 2 KiB Decision comment.

Rate-limited responses include standard limit headers, `Retry-After`, HTTP 429, and the stable `rate_limited` code. Size violations fail before persistence with a stable validation code. Limits may become plan-dependent later, but clients can always rely on the published minimums.

## SDK Structure

The REST protocol is canonical. SDKs improve ergonomics but do not own semantics.

### `@linea/sdk/server`

- Exports `LineaApplicationClient` for one Application-bound key.
- `LineaApplicationClient` provisions subjects, manages Conversations, starts/reads/cancels Executions, and observes events and webhook delivery for its Application.
- Exports `LineaWorkspaceClient` for workspace-bound Workflow, Signal, and cross-Application monitoring operations.
- Neither client changes Application trust configuration or resolves external-subject approvals.
- The credential kind and resource boundary are explicit at construction; a workspace key cannot initialize `LineaApplicationClient`, and an Application key cannot initialize `LineaWorkspaceClient`.

### `@linea/sdk/user`

- Browser, edge, and native-safe end-user client.
- Exchanges identity, manages End-User Sessions, messages, events, Approval Requests, Decisions, Connections, and consent policy.
- Never accepts a workspace API key.
- Exposes asynchronous start handles and SSE/poll reconciliation but no Execution cancellation in the first release.

### `@linea/sdk-react`

- Provider and hooks built on `@linea/sdk/user`.
- Headless hooks are primary; prebuilt UI is optional.
- Supports custom rendering for every state.

### CopilotKit

CopilotKit should be an adapter over `@linea/sdk-react`, not the foundation of the protocol or the only render path. Otherwise Linea excludes Vue, native, non-chat, and custom React applications from the primary design.

Proposed usage:

```tsx
<LineaUserProvider session={session}>
  <ApprovalRequests>
    {(request) => <YourApprovalCard request={request} />}
  </ApprovalRequests>
</LineaUserProvider>
```

A CopilotKit adapter may translate an Approval Request into a CopilotKit action render. It uses the same Decision interface as every other client.

## Operator Mobile Application

The mobile application remains a first-party workspace-member client:

- Better Auth session and live workspace membership;
- workspace switching;
- execution and Signal monitoring;
- workspace-audience Approval Requests only;
- existing `approverEmails` eligibility;
- Expo push notifications;
- no offline Decision queue.

It shares Approval Request persistence and transition machinery but not end-user authentication. Mobile work should not block the End-User Plane and vice versa.

Push delivery requires device registration, unregister/revocation, Expo receipt processing, invalid-token cleanup, retries, and deep-link metadata. The current `notifications` table is the notification record, not sufficient device-delivery infrastructure by itself.

## Execution Environment

Audience is not a Workflow property. The same published Workflow can receive `dev` and `production` traffic while Linea builder surfaces create `draft` Executions.

Workspace behavior-analysis configuration remains workspace scoped, while end-user content retention is Application scoped. Eligibility remains environment scoped:

- only `production` traffic is eligible for behavior analysis;
- only `production` traffic is subject to end-user retention policy;
- `draft` and `dev` are excluded.

The current conversation analyzer does not filter by environment, and the current message model cannot reliably establish a Conversation's environment. First-class production Conversations solve this by pinning environment at creation.

## Delivery Workstreams and Historical Issue Mapping

### Historical issues

- #84 remains the parent for the end-user protocol and external-subject approvals. Its original backend-minted bearer-token mechanism is superseded by this design.
- #85 closed with PR #100 and remains the historical record for the caller-asserted `external_subject` Approval prototype.
- #86 closed with PR #101 and remains the historical record for the unversioned conversation endpoint and backend-minted `lcs_` token prototype.
- #87-#89 retain their original bodies and close as superseded, with links to newly created replacement workstreams.
- #90 closed with PR #102 and remains the historical record for the mobile scaffold. Any release-hardening gaps become follow-up work.
- #91-#93 keep their existing mobile scopes and may be amended in place with the acceptance-criteria corrections below.

GitHub issues and pull requests share one number sequence, so future workstream numbers are never predicted in scratchpads or documentation.

### Superseded prototype cleanup

PRs #100 and #101 landed before this security design was accepted. They introduced an external-subject Approval with no secure Decision path and a self-contained bearer conversation token minted from an Operator-authorized, workspace-scoped endpoint using a caller-asserted subject. No production code used that token to decide an Approval Request, so this was an incomplete prototype rather than an active approval bypass.

Issue #105 removes the unsupported node, worker, API, and bearer-token surfaces before the accepted replacement is built. The legacy Approval persistence fields remain inert until #115 deliberately replaces that model. Existing workspace-audience approvals and unrelated conversation-analysis behavior are preserved.

### Mobile issue corrections

- #91 adds foreground polling and focus refresh, decides whether Workflow filtering is client-side or server-side, and remains read only.
- #92 depends on the new Approval Request and Decision workstream, uses only workspace-audience requests, displays the safe snapshot, and never retries or queues a Decision offline.
- #93 owns authenticated device registration, Expo receipt handling, invalid-token cleanup, retry and fan-out, and uses a concrete existing Signal lifecycle event rather than an undefined threshold.

## Accepted Delivery Order

Create new GitHub issues in this order and replace workstream names with their assigned links only after creation:

1. Remove the superseded external-subject Approval and bearer conversation-token prototypes (#105).
2. Establish shared `packages/protocol` primitives, operation registry, stable errors, events, and idempotency.
3. Add Applications and protected identity configuration.
4. Add immutable Workflow Contracts and Application-Workflow bindings.
5. Add Application keys and explicit scopes.
6. Add External Subjects and pre-provisioning.
7. Add client-direct OIDC Authorization Code with PKCE exchange.
8. Add DPoP-bound End-User Sessions, proof replay protection, and revocation.
9. Add first-class Conversation persistence and migrate message ownership.
10. Add asynchronous server and End-User Execution and Conversation interfaces.
11. Add Approval Request and immutable Decision persistence.
12. Add Decision, timeout, cancellation, and resume race handling.
13. Add end-user Approval Request and Decision interfaces.
14. Add the transactional outbox and deterministic BullMQ dispatch.
15. Add End-User SSE and authoritative-list reconciliation.
16. Add signed webhooks and delivery inspection.
17. Add server SDK clients.
18. Add the browser/native End-User SDK and DPoP handling.
19. Add webhook verification, generated OpenAPI, and route-reference coverage.
20. Add headless React hooks and optional presentation.
21. Add the first-launch end-to-end integration suite.
22. Add the CopilotKit adapter after the headless React interface is stable.
23. Create a later Connections and Action Consent parent, split by provider Connection, immutable Action Intent, connector enforcement, and End User history.

Dependencies follow this order unless two adjacent workstreams prove they consume only an already-merged contract. Each implementation issue stays on its own branch and receives a PR before work begins on the next dependent issue.

## First Approval Launch Gate

External-subject approvals are not called usable until all of the following work together:

- real OIDC Authorization Code with PKCE against at least one external identity provider;
- DPoP-bound browser session;
- Operator-backend-started and End-User-started Executions;
- two separate Conversations for one subject with demonstrably isolated history;
- same-subject approval from a second device;
- cross-subject and copied-token rejection;
- Decision-versus-timeout race verification;
- process-crash and outbox recovery;
- SSE reconnect and expired-cursor reconciliation;
- signed webhook retry and deduplication;
- vanilla browser and React examples using only `/v1`.

Connections, Action Consent, CopilotKit, Operator-asserted identity, group approvals, delegation, offline Decisions, arbitrary API credentials, and the Operator mobile application are explicit later milestones rather than hidden launch dependencies.

## Verification Plan

Backend integration tests use real Postgres and exercise public outcomes:

- issuer, audience, expiry, and signature rejection;
- cross-workspace, cross-Application, and cross-subject isolation;
- copied bearer token without client proof;
- expired and revoked sessions;
- end-user execution allowlists;
- concurrent first-message subject pinning;
- duplicate message and execution idempotency;
- Decision versus timeout race;
- successful Decision with lost-response retry;
- conflicting idempotency-key reuse;
- queue/outbox crash recovery;
- webhook duplicate delivery and rotation grace;
- webhook SSRF rejection;
- CORS origin enforcement;
- safe display size and data-leak boundaries;
- Action Intent mutation after consent;
- revoked Connection use;
- `draft` and `dev` exclusion from behavior analysis and retention.

SDK contract tests verify the same errors and retry behavior through the public HTTP interface. React tests mock only that interface and cover pending, human-decided, timeout-decided, cancelled, reconnecting, and error states. Mobile screen tests cover workspace eligibility, foreground refresh, push deep links, and offline Decision rejection.

## Design Status

The design frontier is closed. The trust boundary, identity flow, resource ownership, Conversation isolation, async lifecycle, approval semantics, event delivery, SDK split, retention, launch gate, and implementation graph are accepted. Further changes should be handled as explicit amendments rather than assumptions made inside an implementation ticket.

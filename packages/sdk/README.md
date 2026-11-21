# @linealabs/sdk

Typed clients for Linea's public `/v1` protocol:

- `Linea` builds, runs and monitors Workflows with a workspace API key.
- `LineaEnvironmentClient` starts production runs with an Environment key.
- `@linealabs/sdk/user` is the browser, edge and native End-User client.
- `@linealabs/sdk/webhooks` verifies webhook deliveries.

```sh
npm install @linealabs/sdk
```

Every client talks to `https://api.getlinea.app` unless you pass `baseUrl`.
Set it to reach a local or self-hosted API. It must use `https`; plain `http`
is accepted only for `localhost`, so keys and session proofs never travel
unencrypted.

## ⚠️ The root entry point is server-side only

An API key is a bearer credential scoped to your **entire workspace**, with
no finer-grained permissions. The platform's CORS policy only blocks browser
requests that carry an `Origin` header — it does nothing to protect a key
that's embedded in client-side JavaScript. Only construct `Linea` from
trusted server-side code (a backend service, a script, a CI job) — never
from code that ships to an end user's device.

The separate `@linealabs/sdk/user` entry point is safe for browsers, edge
runtimes, and React Native. It never accepts an API key.

## End-user client

```ts
import { LineaUserClient } from "@linealabs/sdk/user"

const client = new LineaUserClient({ environmentId: "env_123" })

const authorization = await client.startAuthorization({
  redirectUri: `${location.origin}/oidc/callback`,
})
location.assign(authorization.authorizationUrl)
```

Complete the same authorization after the OIDC redirect. The SDK checks the
state, supplies the saved PKCE verifier, creates a non-extractable proof key,
and retains only an opaque DPoP-bound session.

```ts
const callback = new URL(location.href)
await client.completeAuthorization({
  code: callback.searchParams.get("code")!,
  state: callback.searchParams.get("state")!,
})

const conversation = await client.createConversation({})
const execution = await client.startExecution({
  workflowId: "workflow_123",
  conversationId: conversation.id,
  input: {},
})
const latestExecution = await execution.refresh()
```

Browsers persist authorization, session, and non-extractable proof-key state
in IndexedDB. Edge runtimes use in-memory state. React Native applications
must inject durable `storage` and `proofKeys` implementations backed by the
platform's secure application storage and key store. `proofKeys` returns only
an opaque key identifier and public JWK; private key material must remain in
the platform key store. `fetch` and `crypto` can also be injected when they
are not available on `globalThis`.

`session()` returns public metadata or `undefined`; it never returns the
opaque token or proof key. Expired, revoked, or terminally rejected sessions
are removed with their proof key. Call `revoke()` for explicit sign-out.

`streamEvents()` uses authenticated streaming fetch, resumes with
`Last-Event-ID`, and emits `{ kind: "reconciled" }` after an expired cursor.
Replace the relevant local approval snapshot with that authoritative list
before processing later events. Event notifications are hints and must not be
treated as authoritative resource state.

## Installation

This package isn't published to npm yet — it's workspace-internal. From
another package in this monorepo:

```json
{
  "dependencies": {
    "@linealabs/sdk": "workspace:*"
  }
}
```

## Getting an API key

Create one from your workspace's dashboard: **Settings → API Keys**. This
requires an admin session — API keys can't be created using another API key
(so a leaked key can't mint further keys for itself). The raw key is shown
once, at creation time — store it somewhere safe.

Every key is minted with an explicit list of scopes and a lifetime of 1–365
days (`POST /v1/api-keys` with `{ name, scopes, expiresInDays }`). Grant only
what the integration calls: `workflows:read`/`workflows:write` for
`linea.workflows`, `executions:start` for `workflows.run`, `executions:read`
for `linea.executions`, `signals:read`/`signals:write` for signals. A key also stops working when the admin who minted it leaves the
workspace or loses the admin role.

## Quickstart

```ts
import { Linea } from "@linealabs/sdk"

const linea = new Linea({ apiKey: process.env.LINEA_API_KEY! })

// Against a local API instead:
// new Linea({ apiKey, baseUrl: "http://localhost:3000" })
```

Methods are grouped by resource: `linea.workflows`, `linea.executions`,
`linea.signals`, `linea.regressions` and `linea.auditEvents`.

### Create a Workflow

```ts
const workflow = await linea.workflows.create({
  applicationId: "app_123",
  name: "Support triage",
  slug: "support-triage",
  graph: {
    version: 1,
    trigger: { type: "api" },
    entryNodeId: "start",
    nodes: [
      { id: "start", type: "start" },
      { id: "end", type: "end" },
    ],
    edges: [{ from: "start", to: "end" }],
  },
})

await linea.workflows.update(workflow.id, { description: "Routes tickets" })
await linea.workflows.saveDraft(workflow.id, nextGraph)
const version = await linea.workflows.createVersion(workflow.id, {
  graph: nextGraph,
  message: "Add the triage agent",
})
```

Publishing a version and binding it to an Environment need a signed-in
workspace admin, so they happen in the dashboard, not through an API key.

### Run a Workflow and wait for the result

```ts
const execution = await linea.workflows.run(workflow.id, {
  input: { ticketId: "T-123" },
})
const { execution: finished, steps } = await linea.executions.wait(execution.id)
console.log(finished.status, steps.length)
```

`run` starts the version bound to the dev Environment. `wait` polls every
second until the execution succeeds, fails or is cancelled, and throws
`LineaTimeoutError` after five minutes; both are set with
`{ intervalMs, timeoutMs }`.

### Run in production

Production starts use an Environment key from the Environment's
**Backend keys** tab, and the Workflow binding must allow backend starts.

```ts
import { LineaEnvironmentClient, environmentKey } from "@linealabs/sdk"

const production = new LineaEnvironmentClient({
  environmentId: "env_123",
  environmentKey: environmentKey(process.env.LINEA_ENVIRONMENT_KEY!),
})
const started = await production.startExecution({
  workflowId: "wf_123",
  externalSubjectId: "user_123",
  input: { ticketId: "T-123" },
})
const result = await production.waitForExecution(started.id)
console.log(result.status, result.output)
```

### List executions with cursor pagination

Executions come newest first unless you pass `sort` (`workflow`, `status`,
`trigger`, `duration`, `cost` or `when`, each `.asc` or `.desc`). A cursor is
only valid with the sort that issued it. Duration, cost and status move while
runs are active: when a page reports `changed`, start again from the first page
if you need every run exactly once.

```ts
const query = { status: "failed", sort: "cost.desc" } as const
let page = await linea.executions.list(query)
while (page.nextCursor) {
  page = await linea.executions.list({ ...query, cursor: page.nextCursor })
}
```

### List and resolve signals

```ts
const signals = await linea.signals.list({ workflowId: "wf_123" })
const detail = await linea.signals.get(signals[0]!.id)
await linea.signals.resolve(detail.id)
```

## Error handling

Every request throws one of two error types — never a raw `fetch` error (`executions.wait` adds `LineaTimeoutError`):

```ts
import { LineaApiError, LineaNetworkError } from "@linealabs/sdk"

try {
  await linea.executions.get("does-not-exist")
} catch (error) {
  if (error instanceof LineaApiError) {
    // The server responded, but with an error status.
    console.error(error.status, error.message)
    // error.body is the best-effort parsed response body — its shape isn't
    // uniform (a validation failure's `message` can be an array of issues
    // rather than a string), so treat it as `unknown` if you need to inspect it.
  } else if (error instanceof LineaNetworkError) {
    // The request never reached the server (DNS, connection, timeout).
    console.error(error.message, error.cause)
  } else {
    throw error
  }
}
```

## A note on `costMicros`

`Execution.costMicros` and `ExecutionStep.costMicros` are Postgres `bigint`
columns that arrive over JSON as **decimal strings**, not numbers (JSON has
no native 64-bit integer type). Convert before doing arithmetic:

```ts
const dollars = Number(BigInt(execution.costMicros)) / 1_000_000
```

## Current limitations

- No retry/backoff — a failed request is never automatically retried.
  Retrying a non-idempotent call like `workflows.run` risks a duplicate
  execution, so this is left to the caller.
- `executions.listForWorkflow` is capped at 50 rows server-side with no
  pagination — there's currently no way to read more than that for a single
  workflow.
- `executions.list`' `total` field is informational only (e.g. for display);
  use `hasMore` to decide whether to keep paginating.
- The root and server entry points are intentionally server-only. Browser,
  edge, and native callers use `@linealabs/sdk/user`.

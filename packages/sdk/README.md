# @linea/sdk

A minimal Node client for the Linea platform API: trigger a workflow, read
back its execution, and read signals. This is a v0 — it wraps today's
existing `/v1` REST endpoints exactly as they are, nothing more.

## ⚠️ Server-side only — never use this in a browser

An API key is a bearer credential scoped to your **entire workspace**, with
no finer-grained permissions. The platform's CORS policy only blocks browser
requests that carry an `Origin` header — it does nothing to protect a key
that's embedded in client-side JavaScript. Only construct `LineaClient` from
trusted server-side code (a backend service, a script, a CI job) — never
from code that ships to an end user's device.

## Installation

This package isn't published to npm yet — it's workspace-internal. From
another package in this monorepo:

```json
{
  "dependencies": {
    "@linea/sdk": "workspace:*"
  }
}
```

## Getting an API key

Create one from your workspace's dashboard: **Settings → API Keys**. This
requires an admin session — API keys can't be created using another API key
(so a leaked key can't mint further keys for itself). The raw key is shown
once, at creation time — store it somewhere safe.

## Quickstart

```ts
import { LineaClient } from "@linea/sdk"

const client = new LineaClient({
  apiKey: process.env.LINEA_API_KEY!,
  baseUrl: "http://localhost:3000", // API origin; the SDK adds /v1
})
```

### Trigger a workflow and read its execution

```ts
const execution = await client.triggerWorkflow("my-workflow-slug", {
  customerId: "cus_123",
})

const detail = await client.getExecution(execution.id)
console.log(detail.execution.status, detail.steps.length)
```

### Poll an execution until it finishes

```ts
async function waitForExecution(executionId: string) {
  const terminal = new Set(["succeeded", "failed", "cancelled"])
  for (;;) {
    const { execution } = await client.getExecution(executionId)
    if (terminal.has(execution.status)) return execution
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
```

### List executions with cursor pagination

```ts
import { nextExecutionsCursor } from "@linea/sdk"

let page = await client.listExecutions({ status: "failed" })
console.log(page.executions)

while (page.hasMore) {
  const cursor = nextExecutionsCursor(page.executions.at(-1)!)
  page = await client.listExecutions({ status: "failed", cursor })
  console.log(page.executions)
}
```

### List and resolve signals

```ts
const signals = await client.listSignals({ workflowId: "wf_123" })

const detail = await client.getSignal(signals[0]!.id, {
  environment: "production",
})
if (detail.dimensionsApplicable) {
  for (const dim of detail.dimensions) {
    console.log(
      `${dim.model}: ${(dim.rate * 100).toFixed(1)}% of ${dim.totalRuns} runs`
    )
  }
}

await client.resolveSignal(signals[0]!.id)
```

## Error handling

Every method throws one of two error types — never a raw `fetch` error:

```ts
import { LineaApiError, LineaNetworkError } from "@linea/sdk"

try {
  await client.getExecution("does-not-exist")
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

## Known v0 limitations

- No retry/backoff — a failed request is never automatically retried.
  Retrying a non-idempotent call like `triggerWorkflow` risks a duplicate
  execution, so this is left to the caller.
- `listWorkflowExecutions` is capped at 50 rows server-side with no
  pagination — there's currently no way to read more than that for a single
  workflow.
- `listExecutions`' `total` field is informational only (e.g. for display);
  use `hasMore` to decide whether to keep paginating.
- Node-only — no browser/edge build target (see the security note above for
  why that's intentional, not a gap).

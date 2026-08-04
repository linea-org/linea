# packages/queue

Thin BullMQ wrapper: one Redis connection helper and one queue —
`workflow-execution` — with the producer/consumer helpers `platform-api`,
`background-worker`, and `execution-worker` need. No abstraction beyond
those call sites; a second queue gets a sibling file in `src/queues/`, not a
generic queue factory.

## Non-obvious invariants

- **The connection is created with `maxRetriesPerRequest: null`.** BullMQ
  requires this on any connection a `Worker` uses — without it, a blocking
  poll can throw `MaxRetriesPerRequestError` under normal operation, not
  just on real failures.
- **A job's payload is just `{ executionId: string }`.** Everything else a
  worker needs (`workflowId`, `workflowVersionId`, `trigger`) is already on
  the `executions` row — the queue only needs to say which row to claim,
  not carry a copy of its data that could drift from the source of truth.
- **Tests run against a real Redis, one file at a time** (`fileParallelism:
false` in `vitest.config.ts`) — they share one connection and one queue
  name, so concurrent test files would cross-deliver each other's jobs.

## Public surface

`createConnection()`, `WORKFLOW_EXECUTION_QUEUE`,
`createWorkflowExecutionQueue()`, `enqueueWorkflowExecution()`,
`createWorkflowExecutionWorker()`.

## Deliberately not here

Retry/backoff policy, dead-letter handling, and job priority — Phase 0 has
no error-policy configuration yet (that's a Phase 1 item per
`roadmap.md`), so this wraps BullMQ's defaults rather than a policy that
doesn't exist yet.

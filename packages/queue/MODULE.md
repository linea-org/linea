# packages/queue

Thin BullMQ wrapper: one Redis connection helper and the queues in
`src/queues/` (workflow execution, step replay, regression run, webhook
delivery), with the producer/consumer helpers `platform-api`,
`background-worker`, and `execution-worker` need. No abstraction beyond
those call sites; a new queue gets a sibling file in `src/queues/`, not a
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

See `src/index.ts`.

## Deliberately not here

Dead-letter handling and job priority — this wraps BullMQ's defaults.

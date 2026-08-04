# packages/db

Drizzle schema, client, migrations, and the repository layer — the only
place raw SQL/Drizzle queries against these tables should live. Apps import
`repositories.*`, not the schema tables directly, for anything beyond a
one-off read.

## Non-obvious invariants

- **Tenant and parent relationships are enforced with composite foreign
  keys, not just single-column ones.** `executions.workflow_id` alone isn't
  enough to guarantee the workflow actually belongs to `executions.workspace_id`
  — the FK is on `(workflow_id, workspace_id)` referencing
  `workflows(id, workspace_id)`. Same pattern for `execution_steps` against
  `executions`, and for `workflows.published_version_id` /
  `executions.workflow_version_id` against `workflow_versions`. Postgres
  rejects a mismatched write outright; see `execution-architecture.md` for
  the full reasoning and `execution.repository.spec.ts` /
  `workflow.repository.spec.ts` for a direct proof (a cross-tenant insert
  attempt, asserted to throw).
- **`execution_steps` is shaped like an OpenTelemetry span** (`trace_id`,
  `span_id`, `parent_span_id`, `status`, `attributes`) even though nothing
  ingests foreign OTel spans yet. That's for Phase 2's OTel ingest — the
  shape has to be right from the first migration, since execution history
  can't be backfilled onto a column that didn't exist when the row was
  written.
- **`createWorkflowVersion` locks the workflow row (`FOR UPDATE`) before
  reading `MAX(version)`.** Without it, two concurrent version creates can
  read the same max and race to insert it. This isn't caught reliably by a
  `Promise.all` test — JS scheduling doesn't guarantee real overlap — so the
  regression test in `workflow.repository.spec.ts` drives two raw
  connections directly to prove the lock actually blocks.
- **`completeExecution` only transitions from a non-terminal status.** A
  delayed or retried worker completion arriving after an execution is
  already `succeeded`/`failed`/`cancelled` is a no-op (returns `undefined`),
  not an overwrite.
- **Repository tests run against a real Postgres**, each wrapped in a
  transaction that's rolled back afterward (`test-utils.ts`'s
  `withRollback`) — nested `db.transaction()` calls inside the repository
  functions under test run as savepoints within it, so no manual cleanup is
  needed. One exception: the concurrency test in
  `workflow.repository.spec.ts` needs two genuinely separate connections
  and runs outside that pattern, cleaning up manually.
- **`vitest.config.ts` loads `.env` itself**, independent of Turborepo's env
  passthrough. `turbo.json`'s `test` task also declares
  `"env": ["DATABASE_URL"]` explicitly — Turborepo 2's default strict env
  mode drops any variable not declared on the task, which silently broke
  CI (the workflow set `DATABASE_URL`, turbo stripped it before spawning
  vitest) until that was added.

## Public surface

`schema.*` (table definitions and inferred types), `repositories.*`
(`workflow`, `execution`, `checkpoint`, `schedule`, `secret`, `apiKey`),
`db`/`pool` clients, `relations`. Prefer `repositories.*` over raw schema
access from outside this package.

## Deliberately not here

`kb_data` (documents, chunks, vectors) — Phase 4. Encryption/decryption for
`secrets.encryptedValue` and hashing for `apiKeys.hashedKey` — both happen
at the call site, this package stores and retrieves opaque values only.

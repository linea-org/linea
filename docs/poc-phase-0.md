# Phase 0: Durable Core

The specification for the first buildable slice of Linea. Read `roadmap.md`
for where this sits in the overall sequence, and `repo-structure.md` for the
monorepo layout the work items below refer to.

## The one sentence

A workflow, defined as JSON, triggered by webhook or schedule, executing a
graph of HTTP, transform, branch, and AI steps inside `execution-worker`,
checkpointing after every step to Postgres, resumable after a process crash,
and visible step by step in the dashboard.

## The demo that proves it

This is the single acceptance criterion for the phase. Everything below exists
to make it pass.

> Start a six-step workflow. Kill `execution-worker` with `docker kill` while
> step four is in flight. Restart the worker. The run resumes at step four,
> does not re-execute steps one through three, and completes successfully. The
> dashboard shows the whole thing: every step's input, output, duration, and
> token cost, the crash, and the resume.

It runs as an automated test in CI, not only as a manual demo. The dashboard
half is verified by eye; the durability half is verified by the test.

## Why the trace is in scope

`roadmap.md` makes step-level replay the wedge: re-run one step against the
exact input it originally saw, without re-running the steps before it. Phase 0
does not build replay. It builds the thing replay reads from.

That has two design consequences worth stating up front, because retrofitting
either one is expensive.

**`execution_steps` is a product surface, not a debug log.** Every step records its
resolved input, its output, its error, its timing, and its token cost, in a
shape that is stable enough to replay from and safe enough to show a user.
Fields added later cannot be backfilled onto runs that already happened, and a
workspace's accumulated run history is the asset the whole wedge rests on.

**`execution_steps` is shaped as an OpenTelemetry span.** Trace id, span id, parent
span id, name, start and end time, status, and an attributes bag, alongside
the Linea-specific columns. Phase 0 builds no ingest endpoint and accepts no
foreign traces; it only adopts the shape. The reason is in `roadmap.md`: Phase
2 accepts OTel GenAI spans from agents running outside Linea, so that the
monitoring product is useful to a team before they migrate anything. Choosing
this shape now is nearly free. Converting a year of accumulated run history to
it later is a migration that cannot be backfilled.

## What "exactly once" means here, precisely

Worth stating plainly, because the claim is easy to overstate and a user who
discovers the gap in production will not trust anything else we say.

Checkpointing guarantees **graph progression** is exactly once: a step whose
result was durably recorded will not run its logic a second time on resume.

It does not guarantee **external side effects** are exactly once. If the
worker dies after an HTTP node's request reaches the remote server but before
the result is checkpointed, that request has happened and will happen again on
resume. Steps with side effects are at-least-once.

Phase 0 handles this by recording an idempotency key per step attempt and
exposing it to the node handler, so a caller can pass it through to APIs that
support one. Closing the gap properly is Phase 1 work, under the error-policy
item.

## Scope boundary

**In.** Runtime database schema. Workflow JSON format, node registry, graph
walker. Queue wrapper. `execution-worker` with four node types.
Checkpointing and execution leases. Schedule firing. Workflow and execution
API surface. Minimal AI provider registry. A read-only execution trace in
`apps/web`.

**Out.** Visual builder. Step replay. Code node. Sandbox. `run-gateway`.
Knowledge base. Memory. Connectors. Evals. SDK. Billing.

Two boundaries worth being explicit about. **Replay is out** even though it is
the wedge, because replay of a trace that does not exist yet is not a feature,
it is a demo. Phase 0 earns the right to build it. **The builder is out**
because it is the most visible and most satisfying thing available to build
and it proves nothing about either durability or observability. Workflows in
Phase 0 are authored as JSON, by us.

## Deliberate deviations from repo-structure.md

Recorded here so they do not quietly become permanent.

**The AI node calls `@linea/ai` in-process rather than proxying through
`run-gateway`.** `run-gateway` exists to be the only door into a sandbox.
Phase 0 has no sandbox, so standing up a fourth service to proxy a single
provider call buys nothing. Consequence: a provider key is resolvable inside
the process that walks a customer's graph, which is exactly what the
architecture avoids. Acceptable while the only graphs running are ours.
Reversed in Phase 2, when `run-gateway` is built for the code node anyway.

**No separate lease table.** Lease state lives on the `executions` row as
`leased_by` and `lease_expires_at`. One table instead of two, and there is no
second reader of lease state in Phase 0.

**Terminology: "execution", not "run".** The codebase already committed to
this — `audit-log.ts` and `notification.ts` both have an `execution.*` enum
in place, and the worker app is named `execution-worker`, not `run-worker`.
This doc and `roadmap.md` use "run" informally in prose (a workflow "runs"
unattended), but every table, column, and API resource is named `execution`
to match what already exists. Full data model: `execution-architecture.md`.

## Work items

Nine items. The dependency order is strict for items 1 through 4; items 5
through 8 can start once item 1 has landed. Estimates assume 10 to 12 hours a
week.

### 1. Runtime schema in `packages/db`

**About 1 week.** Blocks every other item.

Existing schema covers auth only (users, sessions, organizations, members,
invitations, audit log, notifications). A workspace is an `organizations` row;
new tables reference `organization_id`.

New tables:

| Table               | Holds                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflows`         | Name, slug, organization, archive state                                                                                                                                                          |
| `workflow_versions` | The graph JSON, a content hash, version number, published timestamp                                                                                                                              |
| `executions`        | Status, trigger type and payload, timing, terminal error, lease fields                                                                                                                           |
| `execution_steps`   | One row per node attempt, shaped as an OTel span: trace/span/parent ids, name, start and end, status, attributes, plus resolved input, output, error, token and cost accounting, idempotency key |
| `checkpoints`       | Sequence number, completed node ids, the execution context snapshot                                                                                                                              |
| `schedules`         | Cron expression, timezone, next and last fire time, enabled flag                                                                                                                                 |
| `secrets`           | Encrypted credential values, scoped to an organization — named `secrets` to match the `secret.*` audit resource already in `audit-log.ts`                                                        |
| `api_keys`          | Hashed key, display prefix, last-used timestamp                                                                                                                                                  |

Acceptance: migration generated and applied, every table has an index
supporting its hot read path, and a seed script inserts one workflow with one
published version.

### 2. `packages/runtime`

**About 2 weeks.** The most consequential item in the phase. The walker's
shape determines whether resume is straightforward or impossible, so it is
worth slowing down on.

- `workflow-json/schema.ts`: the graph format as a zod schema, plus content
  hashing. Nodes, edges, trigger definition, version.
- `nodes/node-registry.ts`: the canonical node list. Per entry, an id, input
  schema, output schema, and `needsSandbox`. Four entries in Phase 0, all
  false.
- `nodes/definitions/`: one file each for `http`, `transform`, `branch`, `ai`.
  Schema and metadata only, never execution logic.
- `interpreter/walker.ts`: the graph walk, written as a generator that yields
  one step at a time and accepts the step result back. The caller owns
  checkpointing and persistence. This inversion is what makes item 4 simple.

Acceptance: unit tests walk a branching six-node graph to completion with a
stub executor, and a walker resumed from a mid-graph checkpoint produces the
same remaining step sequence as one that never stopped.

### 3. `packages/queue`

**About half a week.**

Thin BullMQ wrapper. Redis connection from `@linea/config`, typed job payloads,
one `workflow-execution` queue, and the producer and consumer helpers the two
worker apps need. No abstraction beyond what those two call sites use.

Acceptance: a job enqueued in a test is received by a consumer with its
payload type intact.

### 4. `apps/execution-worker`

**About 2.5 weeks.**

Follows `repo-structure.md`'s layout: `NestFactory.createApplicationContext()`
bootstrap with no HTTP listener, `runs/` module consuming the queue, `graph/`
module driving the walker, `checkpoints/` module, `health/` liveness check.

- Four node handlers under `graph/nodes/`, each validating against its
  registry entry.
- The run lease with a heartbeat, so an abandoned run becomes claimable by
  another worker after its lease expires rather than being stuck forever.
- A checkpoint write after every step, in the same transaction as the
  `execution_steps` insert. Splitting them across two transactions
  reintroduces exactly the failure window this phase exists to close.
- Token and cost accounting written onto the AI node's step row at the moment
  of the call. It cannot be reconstructed per step from provider billing
  later.

Acceptance: the crash-and-resume test from the top of this doc.

### 5. `packages/ai`

**About 1 week.** Can run in parallel with items 2 through 4.

Only what the AI node needs: `registry.ts` keyed on provider, model, and
version rather than a bare model name, the shared provider interface, one
Anthropic adapter, and a key resolver reading a workspace's stored provider
connection with a fallback to Linea's own key.

Acceptance: a completion call resolved through the registry, with a
workspace-specific key taking precedence over the platform key.

### 6. Workflow and execution API in `apps/platform-api`

**About 1.5 weeks.** Needs item 1; does not need items 2 through 4 to start.

- `workflows/`: create, list, get, update, publish a version.
- `executions/`: trigger an execution, list executions for a workflow, get an
  execution with its step history.
- `triggers/`: the inbound webhook endpoint, resolving a workflow by token and
  enqueueing.
- API key authentication as an alternative to the session guard, so an
  execution can be triggered from outside a browser.

Acceptance: a workflow can be created, published, triggered by webhook, and
its completed execution inspected, entirely over HTTP with an API key.

### 7. Schedule firing in `apps/background-worker`

**About half a week.**

One module. Polls `schedules` for rows due, enqueues a `workflow-execution`
job, advances `next_run_at`. Nothing else from the `background-worker` layout
in `repo-structure.md` is Phase 0 work.

Acceptance: a schedule set to every minute produces one execution per minute,
and exactly one, with two worker instances running.

### 8. Execution trace in `apps/web`

**About 2 weeks.** Needs item 6. This is the wedge made visible, so it is the
one Phase 0 item where "it works" is not the bar.

- Workflow list and workflow detail, both read-only.
- Execution list per workflow: status, trigger, duration, cost, when.
- Execution detail: the step timeline. Per step, its resolved input, its
  output, its error, its duration, and its token cost, each expandable. A
  crash and the resume that followed it are visible as events on that
  timeline rather than inferred from a gap.
- No authoring anywhere in this item. Workflows are JSON, edited by hand.

Uses `@linea/ui`, which already carries the full shadcn set, and
`lucide-react` for icons per `AGENTS.md`. No new UI dependencies.

Acceptance: someone who did not build Linea can open a completed execution and
explain what the workflow did, where it crashed, and what it cost, without
asking a question.

### 9. Demo and end-to-end test

**About 1 week.**

A committed example workflow exercising all four node types across six steps,
plus the automated crash-and-resume test wired into CI, plus a short script
that runs the demo locally for anyone evaluating the repo.

Acceptance: `pnpm test` runs the crash-and-resume case, and a first-time
reader can run the demo from the README in under ten minutes.

## Sequencing at part-time capacity

Roughly twelve weeks end to end:

```
Week 1         Item 1  schema
Week 2 to 3    Item 2  runtime              (items 5, 6 unblocked)
Week 4         Item 3  queue
Week 5 to 7    Item 4  execution-worker
Week 8         Item 5  ai          Item 6  platform-api
Week 9         Item 6  platform-api (cont)  Item 7  background-worker
Week 10 to 11  Item 8  execution trace
Week 12        Item 9  demo and e2e
```

Items 5, 6, and 8 are the natural handoff points if a second contributor picks
work up: 5 and 6 depend only on item 1, and 8 depends only on 6.

## What could go wrong

- **The walker resists resume.** The likeliest technical failure, and the
  reason item 2 gets two weeks rather than one. Mitigation: write the resume
  test in item 2 against a stub executor, before `execution-worker` exists.
- **The trace records the wrong things.** The quieter and more expensive
  failure. Execution history cannot be backfilled, so a field missing from
  `execution_steps` in Phase 0 is missing from every execution that happened
  before someone notices. Mitigation: before item 4 is written, sketch four
  things against item 1's schema and confirm each can be built from it — the
  Phase 1 replay call, a Phase 1 graph-level flagger query, the Phase 2
  mapping from a foreign OTel span, and a Phase 3 eval-dataset row. Half a day
  of sketching against a migration that has not shipped yet is the cheapest
  this check will ever be.
- **Scope creeps toward the builder.** The visual builder is the most visible
  thing available to build and proves nothing about either durability or
  observability. It stays in Phase 1.
- **The validation track gets skipped.** Building is more comfortable than
  talking to users, and Phase 0's fourth exit criterion is the one most likely
  to be quietly dropped. See `validation.md`.

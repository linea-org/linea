# Roadmap

Companion to `product-vision.md` (what Linea is and who it's for) and
`repo-structure.md` (how the monorepo is laid out). This doc answers a third
question: in what order do we build it, and how do we know a phase is done.

## Working assumptions

These drive every estimate below. If one changes, the estimates change.

- **Durations are directional, not commitments.** They assume a small,
  part-time team and will shift as capacity and contributors change — treat
  them as relative ordering, not a schedule.
- **Observability is the wedge.** Not a pillar we get to third. It is the
  reason someone picks Linea, and it shapes what ships in Phase 0. See below.
- **Technical builders first, non-developers later and deliberately.** The
  non-developer audience becomes first-class once mobile and the authoring
  surface are mature, not before. It is a phase, not an afterthought.
- **Nothing ships to outside users before Phase 1.**

## Why observability is the wedge

The category is crowded and increasingly commoditized. Tracing vendors exist,
several are open source, and OpenTelemetry now has GenAI semantic conventions.
Selling "we show you traces" loses that fight.

What Linea has that a bolt-on tool does not is the execution itself: the
graph, the checkpoint after every step, and the exact input each step saw.
Two things follow from that, and only those two are worth claiming.

**1. Step-level replay.**

> Re-run step 4 with a changed prompt, against the exact input it originally
> saw, without re-running steps 1 through 3.

Be precise about the boundary. Session-level replay, re-running a whole
recorded interaction against your endpoint, is available to any tool holding
the inputs, and shipped products already do it. Replaying a single step from
the middle of a graph is what needs the checkpoint, and the checkpoint is what
needs having executed the run.

**2. A fix loop that does not leave the platform.** The observability tools
close their loop through the customer's codebase: detect a failure, hand the
context to a coding agent, open a pull request, merge, deploy, regression-test
in CI. That is a good loop and it works for an agent that lives in a repo.
Linea's loop is replay, change, publish a workflow version. Seconds rather
than a deploy cycle, and no repo involved.

Everything else in the observability story (trace, cost attribution, failure
clustering, eval datasets built from real runs) is table stakes that we need
in order to be credible, not differentiation.

The convenient part: the checkpoint table Phase 0 needs for crash recovery is
already the replay substrate. Durability and observability are one data model
viewed twice. The consequence is that the execution trace UI, which would
otherwise be deferrable, is Phase 0 scope.

**Terminology.** The codebase already calls one instance of a workflow
running an "execution" — `audit-log.ts` and `notification.ts` both have an
`execution.*` enum, and the worker app is `execution-worker`, not
`run-worker`. Every table, column, and API resource in this doc set follows
that. "Run" appears here only as an ordinary English verb.

### The adoption problem, and OTel ingest

Both advantages above only apply to workflows already running on Linea. A
tracing tool is a side-by-side install; Linea is a migration. That ordering is
backwards, and it is the single biggest risk to the wedge.

**The plan: accept OpenTelemetry GenAI spans from agents running anywhere.**
The monitoring product then works before migration rather than after it. Land
alongside whatever a team runs today, earn the right to be their execution
layer later, on the strength of the two things OTel ingest cannot give them.

This has one Phase 0 consequence and one Phase 2 line item:

- **Phase 0.** `execution_steps` is shaped so a row maps cleanly onto an OTel
  span: trace id, span id, parent span id, name, start and end, status,
  attributes. Native executions populate it directly. Costs close to nothing
  now; retrofitting it onto a year of accumulated execution history is a
  migration that cannot be backfilled. No ingest endpoint in Phase 0, just
  the shape.
- **Phase 2.** The actual OTLP ingest endpoint, the mapping from foreign spans
  to Linea's model, and an honest UI distinction between an execution Linea
  ran (replayable) and a trace Linea only observed (not replayable).

Full schema for both: `execution-architecture.md`.

## Phase map

| Phase | Name                         | Ships                                                                      | Rough duration |
| ----- | ---------------------------- | -------------------------------------------------------------------------- | -------------- |
| 0     | Durable Core                 | An execution survives a worker crash, resumes, and is visible step by step | 10 to 12 weeks |
| 1     | Observability Alpha          | Step-level replay, flaggers and signals, authoring, outside users          | 14 to 18 weeks |
| 2     | Escape Hatch and OTel Ingest | Sandboxed code nodes, traces from agents running elsewhere                 | 10 to 12 weeks |
| 3     | Evals                        | Evals generated from signals, regression detection, behaviours             | 8 to 10 weeks  |
| 4     | Memory and Knowledge         | Agents that remember and search                                            | 8 to 12 weeks  |
| 5     | Distribution and Mobile      | SDK, public API, embeds, mobile monitoring and approval                    | 10 to 14 weeks |
| 6     | Tuning, Non-developers, GA   | Execution history acts on itself; billing; a second audience               | Open-ended     |

Durations are sequential at part-time capacity and assume no parallel
contributor. They are planning aids, not commitments.

---

## Phase 0: Durable Core

**Goal.** Prove that Linea can hold a multi-step workflow through a process
crash, pick it back up without redoing work, and show exactly what happened.

Full specification, including the work-item breakdown and acceptance
criteria, lives in `poc-phase-0.md`. Summary of scope:

In scope: the runtime schema in `packages/db`, the workflow JSON format and
graph walker in `packages/runtime`, a BullMQ wrapper in `packages/queue`, the
`execution-worker` app with four node types (HTTP, transform, branch, AI),
checkpointing, schedule firing in `background-worker`, the workflow and
execution API surface in `platform-api`, and a read-only execution trace in
`apps/web`.

Out of scope: the visual builder, step replay, the code node, the sandbox,
`run-gateway`, the knowledge base, memory, connectors, evals, the SDK.

The execution trace is in scope specifically because observability is the
wedge. A demo of the selling point cannot be a `curl` command. Replay is not
in scope, because replay only means something once the trace it replays from
is real.

**Exit criteria.**

1. The crash-and-resume test passes in CI: a six-step workflow, worker killed
   at step four, worker restarted, the execution resumes at step four without
   re-executing steps one through three, and it completes.
2. The execution trace shows that crash, that resume, and every step's input,
   output, duration, and token cost, readable by someone who did not build it.
3. Three workflows that we actually depend on have run unattended on Linea
   for at least one week, on a schedule, without manual intervention.
4. The validation track in `validation.md` has produced five conversations
   that confirm or refute the replay pitch specifically.

---

## Phase 1: Observability Alpha

**Goal.** A technical builder who is not us moves a real job onto Linea, and
stays for the trace.

- **Step-level replay.** The headline. Pick any step of any past execution,
  change its configuration or prompt, re-run it against the exact input it
  saw, and diff the output. Nothing else in this phase matters as much.
- **Full execution observability.** Cost and token attribution per step and
  per workflow, structured logs, alerting on failure and on cost anomaly.
- **Flaggers.** Cheap automatic detectors that score an execution without
  anyone configuring anything. The transcript-level ones are standard across
  the category: tool error, empty response, refusal, user frustration. The
  graph-level ones are ours alone, because only the runtime can see them: a
  retry storm, a branch never once taken across thousands of executions, a
  step whose cost jumped an order of magnitude against its own history, an
  execution that hit its iteration ceiling, a checkpoint that resumed more
  than twice. Build the graph-level ones first. They are cheaper (no model
  call, just queries over `execution_steps`) and they are the differentiated
  half.
- **Signals.** Flagged executions grouped into named, trackable failure
  patterns with a status, a size, and a trend, rather than a list of red rows.
  This is the difference between a trace viewer and a monitoring product, and
  it is what makes the Phase 3 eval work possible.
- **Visual builder.** Authoring, not just viewing. Node palette driven by
  `node-registry.ts`, so new node types appear without frontend changes.
- **Connectors.** Four to six, chosen by what the alpha users actually need.
  `packages/connectors` gets its internal structure written up first.
- **Secrets.** Workspace-scoped, encrypted at rest, never returned after
  write. Redaction rules for what the trace is allowed to display, which
  becomes load-bearing the moment an outside user's data is in a trace.
- **Error policy.** Per-node retry counts, backoff, timeouts, and a
  workflow-level failure path.

**Exit criteria.** Five outside users each have a workflow whose executions
have run unattended for two consecutive weeks, and at least three of them
have used replay to fix something. The second half of that sentence is the
real test.

---

## Phase 2: Escape Hatch and OTel Ingest

**Goal.** The step that does not fit a node becomes code the user writes and
Linea runs it safely. And Linea becomes useful to a team before they have
moved anything onto it.

Sequenced before evals because observability over a toy workload proves
nothing. Users need to be running their real work first.

### OTel ingest

The adoption fix described at the top of this doc. Roughly a third of the
phase.

- An OTLP endpoint accepting GenAI-convention spans, workspace-scoped by API
  key.
- Mapping from foreign spans onto Linea's model, which is why Phase 0 shapes
  `execution_steps` as a span in the first place.
- **An honest distinction in the UI between an execution Linea ran and a
  trace Linea only observed.** Linea-run executions replay; observed traces
  do not. Blurring this to make the feature matrix look better is the fastest
  way to lose a user's trust the first time a replay button does nothing.
- Flaggers and signals from Phase 1 apply to observed traces too. That is the
  whole point: the monitoring product has to be worth using on its own before
  anyone migrates.

### Sandboxed code nodes

- `packages/sandbox-provider`: the isolation primitive and its lifecycle.
- `apps/run-gateway`: the only door into a sandbox. Run-scoped token issuing
  and verification, sandbox claim and result endpoints, the tenant wipe rule.
- The code node in `packages/runtime` (`needsSandbox: true`) and its handler
  pair across `execution-worker` and `run-gateway`.
- The AI proxy moves behind `run-gateway`, resolving the Phase 0 deviation
  recorded in `poc-phase-0.md`.
- Replay extends to code nodes, which is the hard case: replaying a sandboxed
  step means re-provisioning a sandbox with the recorded input.

**Exit criteria.** An outside user ships a workflow whose critical step is
code they wrote, and it runs in production for two weeks. Plus a written
threat model for the sandbox boundary, reviewed before any outside code runs.
Plus one team sending Linea traces from an agent that does not run on Linea,
who says the signals are worth reading.

---

## Phase 3: Evals

**Goal.** Turn accumulated execution history into a regression net. This is
the first rung of the tuning ladder described at the bottom of this doc, and
the natural compounding of the observability wedge.

- **Evals generated from a signal.** The important one. Nobody writes evals,
  because the blank page is the whole cost. A signal is a named failure that
  already happened with real examples attached, so the eval derives from it
  rather than being authored from scratch. Turning a Phase 1 signal into a
  scored dataset should be one action.
- **Datasets from real executions.** One click to add any past execution, or
  any single step of one, to an eval set.
- **Graders.** Exact match, structural checks, and LLM-as-judge, defined per
  workflow.
- **Regression detection.** Re-score a dataset on every published workflow
  version, block or warn on a drop.
- **Behaviours.** Semantic clustering of executions into what workflows are
  actually being used for, with trends. Answers "what is happening" rather
  than "what broke". Lowest priority of the five and the first thing to cut.

**Exit criteria.** A user changes a prompt, sees a regression caught before it
reaches production, and does not ship it. And at least half the eval sets in
existence were generated from a signal rather than authored by hand, because
if that number is low the generation feature did not work.

---

## Phase 4: Memory and Knowledge

**Goal.** Agents that get better as a workspace uses them.

- `packages/kb`: upload, extract, chunk, embed, hybrid search over owned
  storage. Connectors layer on top as an additional source.
- The `kb-embed` consumer in `background-worker`.
- Memory extraction in `background-worker`: extract, confidence check, secret
  filter, embed, dedupe, store.
- The `kb` and memory node types.

**Exit criteria.** A workflow whose output measurably improves between its
first execution and its fiftieth, with the improvement visible in the Phase 3
eval scores rather than asserted.

---

## Phase 5: Distribution and Mobile

**Goal.** Authoring in code is a first-class entry point, and operating an
agent does not require a desk.

- `packages/sdk`: workflow definition, trigger, execution inspection.
- Public API with explicit versioning and a deprecation policy.
- `packages/sdk-react`: embeddable chat and runner components.
- **Mobile: monitoring and approval, not authoring.** Watch executions, read
  a trace, get pushed a failure, and approve or reject a paused step from a
  phone. Full mobile authoring is deferred to Phase 6, where it belongs with
  the non-developer audience it actually serves.
- **Human-in-the-loop approval nodes**, which mobile approval requires. A
  node that pauses an execution pending a decision is the same
  checkpoint-and-resume machinery Phase 0 built, pointed at a person instead
  of a crash.

**Exit criteria.** An outside user authors, triggers, and inspects a workflow
end to end without opening the dashboard, and a second user approves a
production execution from a phone.

---

## Phase 6: Tuning, Non-developers, GA

**Goal.** Execution history stops being a record and starts being an input. A
second audience becomes real. Linea becomes something a company can put a
budget line against.

- **Tuning**, meaning rungs 3 and optionally 4 of the ladder below: few-shot
  example selection drawn from a workspace's own successful executions, and
  optionally automated prompt optimization against Phase 3 graders.
- **Non-developer audience becomes first-class.** Templates, guided
  authoring, plain-language workflow descriptions, mobile authoring. This is
  a deliberate widening, not a repositioning: technical builders remain the
  primary audience and the SDK stays first-class.
- Usage metering and billing, multi-region, an SLA worth publishing.

**Exit criteria.** A real workload in production that someone would notice
going down.

---

## What tuning means, concretely

Recorded here because "tuning" is a word that covers five different
mechanisms, and the roadmap commits to some and not others. In roughly the
order the industry actually uses them:

| Rung | Mechanism                                                                                         | Who does the work            | Where in this roadmap |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------- |
| 1    | Eval-driven human iteration: define a dataset and graders, change something, compare scores       | Human                        | Phase 3               |
| 2    | Failure clustering: group bad executions by failure mode and surface the top few                  | System surfaces, human fixes | Phase 3               |
| 3    | Few-shot selection: retrieve similar successful past executions and inject them as examples       | System                       | Phase 6               |
| 4    | Automatic prompt optimization: search over instructions and demonstrations against a metric       | System                       | Phase 6, optional     |
| 5    | Distillation and online routing: fine-tune a small model on traces, or A/B variants in production | System                       | Not committed         |

Two things follow. First, every rung above 1 requires rungs 1 and 2 to exist,
which is why Phase 3 has to precede Phase 6 and cannot be skipped. Second, the
hard part of rung 4 is never the optimizer, it is having a metric worth
optimizing against, which is exactly what Phase 3 produces. An optimizer
without good graders makes an agent confidently worse.

Rung 3 is also the literal mechanism behind the vision doc's "compounding
data" idea. A workspace whose workflow has ten thousand executions has ten
thousand candidate examples. A fresh self-hosted setup has none.

## Ordering rules

1. **`packages/db` blocks everything.** No app work starts against a table
   that does not exist yet. Schema changes land first, on their own branch.
2. **No app imports another app.** Anything two apps need lives in
   `packages/*`. This is what keeps the four services independently
   deployable, and it is cheapest to enforce from the first line of code.
3. **Roles are roadmap-driven, not service-owned.** Work is assigned by phase
   item, not by "you own execution-worker". At this team size, service
   ownership creates blocking dependencies where none need to exist.
4. **Anything that weakens the trace is a Phase 0 or Phase 1 bug, not a
   backlog item.** If observability is the reason people pick Linea, a gap in
   what an execution records is a product defect regardless of which phase it
   surfaces in.

## What this doc does not cover

Dates. Phase durations are relative and capacity-dependent, and pinning
calendar dates to a part-time roadmap produces a document that is wrong within
a month. Track actual progress in GitHub milestones, one per phase, and let
this doc describe order and exit criteria only.

It also doesn't cover how documentation itself gets built — see
`documentation-strategy.md` for that, gated on these same phases.

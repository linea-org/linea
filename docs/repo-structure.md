# Repo structure

Status of the repo as of this writing:

- `apps/web` is real. Auth flows, workspace onboarding, invitations, and the `w/$slug` workspace shell.
- `apps/platform-api` is a Nest skeleton: bootstrap, health check, and `/me`. No feature modules yet.
- `apps/background-worker`, `apps/execution-worker`, and `apps/run-gateway` are empty folders with a bare `package.json`.
- `packages/auth`, `ui`, `config`, and `types` are built and in use. `ui` carries the full shadcn component set.
- `packages/db` has a schema and two applied migrations, covering authentication only: users, sessions, organizations, members, invitations, audit log, notifications. None of the runtime tables described below exist yet.
- `packages/ai` is scaffolded with lint and tsconfig wiring and empty `src/` folders for providers and key resolution, but no provider code.
- `packages/runtime`, `connectors`, `sandbox-provider`, `queue`, `sdk`, and `sdk-react` are bare `package.json` stubs with no `src/`.
- `packages/kb` does not exist in the workspace at all.

Linea owns knowledge-base storage as the default path, with connectors layered on top as an additional source rather than a replacement. `packages/kb` below covers the owned side.

The node registry lives inside `runtime` rather than as its own package. Reasoning below.

This doc proposes the internal `src/` layout for the three unstarted apps, the AI, node-registry, and KB package gaps, and how each piece pulls from the rest of `packages/*`. For the order this gets built in, see `roadmap.md`, and for the first slice specifically, `poc-phase-0.md`.

## Convention carried over from platform-api

`platform-api` is a standard Nest app: `nest-cli.json`, `src/main.ts` bootstrapping a root `AppModule`, feature modules under `src/<feature>/`, `tsconfig.build.json` for prod builds, Jest configured inline in `package.json`. The three new apps follow the same shape — Nest as the framework even for `run-gateway` and `background-worker`, which aren't HTTP-first, since Nest's module/provider system is worth keeping consistent across all four apps even where the entrypoint isn't a REST controller. `execution-worker` and `background-worker` bootstrap with `NestFactory.createApplicationContext()` instead of a full HTTP server; `run-gateway` runs Nest's HTTP adapter since it does serve requests (the sandbox's only door in).

## execution-worker

Runs the workflow graph in-process for a run's full duration. Owns the interpreter loop, one handler per node type, checkpointing, and the one call out to `run-gateway` when a code node is hit.

```
apps/execution-worker/
├── src/
│   ├── main.ts                    # bootstrap, no HTTP listener — pulls jobs off queue-redis
│   ├── app.module.ts
│   ├── runs/
│   │   ├── runs.module.ts
│   │   ├── runs.consumer.ts       # queue consumer: workflow-execution queue
│   │   ├── runs.service.ts        # claims a run, holds it for its lifecycle
│   │   └── run-lease.service.ts   # heartbeat + lease renewal while a run is held
│   ├── graph/
│   │   ├── graph.module.ts
│   │   ├── interpreter.service.ts # walks the workflow JSON step by step
│   │   │                          # (imports the shared walker from @linea/runtime,
│   │   │                          #  this is the app-side driver around it)
│   │   └── nodes/
│   │       ├── http.node.ts
│   │       ├── transform.node.ts
│   │       ├── branch.node.ts
│   │       ├── integration.node.ts  # calls @linea/connectors directly, no sandbox
│   │       ├── kb.node.ts           # calls @linea/kb (owned storage, the default)
│   │       │                        # and/or @linea/connectors if the workspace
│   │       │                        # has an external source configured too
│   │       ├── ai.node.ts           # proxied through run-gateway
│   │       └── code.node.ts         # the one node type that calls run-gateway
│   │                                # for a sandbox
│   ├── checkpoints/
│   │   ├── checkpoints.module.ts
│   │   └── checkpoints.service.ts # writes checkpoints + execution_steps via @linea/db, resume-from-last-checkpoint logic
│   ├── gateway-client/
│   │   ├── gateway-client.module.ts
│   │   └── gateway-client.service.ts # the one outbound call to run-gateway, code nodes only
│   └── health/
│       └── health.controller.ts   # liveness/readiness only, not a real API surface
├── test/
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

Depends on (`workspace:*`): `@linea/db`, `@linea/runtime`, `@linea/kb`, `@linea/connectors`, `@linea/queue`, `@linea/auth`, `@linea/config`.

Notably does **not** depend on `@linea/sandbox-provider` — it never talks to a sandbox directly, only through `run-gateway`'s HTTP surface via `gateway-client`.

## run-gateway

The only door into a sandbox. A real HTTP service (unlike the other two), since it's what a sandbox calls back into. Claims/wipes sandboxes for code nodes and plugin actions, verifies run-scoped tokens, proxies AI provider calls.

```
apps/run-gateway/
├── src/
│   ├── main.ts                     # HTTP listener — this is the door
│   ├── app.module.ts
│   ├── tokens/
│   │   ├── tokens.module.ts
│   │   ├── tokens.service.ts       # issues + verifies run-scoped gateway tokens
│   │   └── token.guard.ts          # Nest guard, applied to every route below
│   ├── sandbox/
│   │   ├── sandbox.module.ts
│   │   ├── sandbox.controller.ts   # POST /sandbox/claim, /sandbox/:id/result
│   │   ├── sandbox-pool.service.ts # warm pool for code-node + plugin sandboxes
│   │   └── wipe.service.ts         # enforces the wipe rule between tenants
│   ├── ai-proxy/
│   │   ├── ai-proxy.module.ts
│   │   ├── ai-proxy.controller.ts  # POST /ai/complete — resolves keys, never
│   │   │                           # forwards them into the sandbox response
│   │   └── provider-key.service.ts
│   ├── plugins/
│   │   ├── plugins.module.ts
│   │   ├── plugins.controller.ts   # third-party plugin action dispatch
│   │   └── plugin-pool.service.ts  # separate, workspace-scoped pool from
│   │                               # the code-node pool above
│   └── health/
│       └── health.controller.ts
├── test/
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

Depends on: `@linea/db`, `@linea/sandbox-provider`, `@linea/auth`, `@linea/config`. Does **not** depend on `@linea/connectors` — integration and KB calls never reach a sandbox, so `run-gateway` has no reason to know connectors exist.

## background-worker

Everything async that isn't dispatch. One consumer module per queue it drains, stateless, scales with queue depth.

```
apps/background-worker/
├── src/
│   ├── main.ts                    # bootstrap, no HTTP listener — pulls from queue-redis
│   ├── app.module.ts
│   ├── memory/
│   │   ├── memory.module.ts
│   │   ├── memory-extract.consumer.ts  # memory-extract queue
│   │   └── memory-extract.service.ts   # extract, confidence check, secret
│   │                                   # filter, embed, dedupe, store
│   ├── schedules/
│   │   ├── schedules.module.ts
│   │   └── schedule-firing.service.ts  # cron-style polling, enqueues
│   │                                   # workflow-execution jobs
│   ├── events/
│   │   ├── events.module.ts
│   │   └── control-plane-event.consumer.ts # relays audit/usage/notification
│   │                                        # events back to platform-api
│   ├── cleanup/
│   │   ├── cleanup.module.ts
│   │   └── checkpoint-cleanup.consumer.ts  # checkpoint-cleanup queue
│   └── health/
│       └── health.controller.ts
├── test/
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

Depends on: `@linea/db`, `@linea/queue`, `@linea/ai`, `@linea/kb`, `@linea/auth`, `@linea/config`. Does not depend on `@linea/runtime`, `@linea/connectors`, or `@linea/sandbox-provider` — it never executes a workflow or touches a sandbox, only background jobs against Postgres and outbound provider calls for embedding/extraction. `@linea/kb` is here for the `kb-embed.consumer.ts` module described under `packages/kb` below.

## packages/ai — the missing provider registry

Every AI and embedding call in the design is proxied and key-resolved server-side: `run-gateway`'s `ai-proxy` module resolves keys and calls providers on a code node's or workflow's behalf, and `background-worker`'s `memory-extract` consumer calls a small model plus an embedding model during capture. Right now nothing owns "which providers exist, which models each one offers, and how to call them uniformly" — that logic would otherwise get duplicated between those two apps, which is exactly the kind of thing that belongs in `packages/*`, not copy-pasted twice.

```
packages/ai/
├── src/
│   ├── registry.ts              # the shared registry: provider × model × version ×
│   │                             # output size × normalization, keyed explicitly —
│   │                             # never just a bare model name (same rule the KB
│   │                             # design already applies to embedding models)
│   ├── providers/
│   │   ├── provider.interface.ts  # complete(), embed() — one shape every
│   │   │                          # provider adapter implements
│   │   ├── anthropic.provider.ts
│   │   ├── openai.provider.ts
│   │   └── google.provider.ts
│   ├── key-resolution/
│   │   └── key-resolver.ts      # resolves a workspace's own key vs. Linea's,
│   │                             # never returns the raw key to a caller outside
│   │                             # run-gateway's process boundary
│   └── index.ts
├── package.json
└── tsconfig.json
```

Depends on: `@linea/db` (to read a workspace's stored provider connection), `@linea/config`.

Used by: `run-gateway` (`ai-proxy.controller.ts` calls `registry` + `key-resolver` directly, this is the one place a real key exists at runtime), `background-worker` (`memory-extract.service.ts` calls `registry` for extraction + embedding), and `platform-api` (reads the registry to populate the provider-connection UI, never calls `key-resolver` since it never needs the raw key). `execution-worker` does **not** depend on this package — even its `ai.node.ts` only calls `run-gateway` over HTTP, same as `code.node.ts` does for sandboxes, so no provider key or provider SDK ever loads inside the process actually walking a customer's workflow graph.

Adding a provider or a same-size model later is one new `registry.ts` entry and, if it's a genuinely new provider, one new file under `providers/` — no changes anywhere it's consumed.

## packages/kb — owned knowledge-base storage

The default KB path: upload, chunk, embed, store, search — all owned by Linea. Deliberately scoped down: no partitioning, no reranking, no dedicated-machine local-copy mode, no versioning.

```
packages/kb/
├── src/
│   ├── upload/
│   │   ├── extract.ts            # pulls text from file/plain-text/URL uploads,
│   │   │                         # 20MB cap, original file discarded after extraction
│   │   └── chunk.ts               # splits extracted text into ~512-token chunks
│   ├── embedding/
│   │   └── embed-batch.ts         # batches ~64 chunks per call, uses @linea/ai's
│   │                               # registry rather than calling a provider directly
│   ├── search/
│   │   └── hybrid-search.ts       # vector similarity + full-text, merged ranking —
│   │                               # the one search implementation, no reranking yet
│   ├── store/
│   │   └── kb.repository.ts       # reads/writes kb_data via @linea/db
│   └── index.ts
├── package.json
└── tsconfig.json
```

Depends on: `@linea/db` (kb_data schema), `@linea/ai` (embedding calls go through the shared registry, not a bare provider SDK import).

Used by: `platform-api` (`upload/` — the dashboard/SDK upload endpoint calls `extract.ts` and `chunk.ts`, then enqueues embedding), `background-worker` (a `kb-embed.consumer.ts` under a `kb/` module, mirroring `memory/memory-extract.consumer.ts`'s shape, drains the `embedding-generate` queue and calls `embed-batch.ts` then `kb.repository.ts`), `execution-worker` (`kb.node.ts` calls `hybrid-search.ts` directly, in-process, no sandbox — same as an integration node). `run-gateway` does not depend on this package; KB search happens inside `execution-worker`, not proxied through the gateway, since it's Linea's own code same as an integration call.

Two of the apps laid out above carry KB pieces as a result: `platform-api` needs an `src/kb/` module (upload controller + chunk trigger), and `background-worker` needs the `kb/kb-embed.consumer.ts` sibling to its `memory/` module, draining `embedding-generate` the same way `memory-extract.consumer.ts` drains `memory-extract`.

## The node registry — lives in packages/runtime, not its own package

`execution-worker`'s `graph/nodes/` folder has one file per node type today, but nothing yet defines the canonical list of node types, their input/output schemas, or which ones are allowed to reach a sandbox. That belongs in `@linea/runtime`, not a separate `packages/nodes` package, for the same reason `token.guard.ts` in `run-gateway` needs to know it too: `runtime` is already the shared contract both `execution-worker` (executes the graph) and `run-gateway` (validates that an incoming code-node call actually matches a real step in a real workflow version) depend on. Splitting the node registry into its own package would mean both of those still need to import it directly, so it's not saving a dependency, only adding a package.

```
packages/runtime/
├── src/
│   ├── interpreter/
│   │   └── walker.ts             # the actual step-by-step graph walk,
│   │                             # execution-worker's interpreter.service.ts
│   │                             # drives this
│   ├── nodes/
│   │   ├── node-registry.ts      # the canonical list: id, input schema, output
│   │   │                         # schema, and a needsSandbox: boolean flag
│   │   ├── definitions/
│   │   │   ├── http.node.ts
│   │   │   ├── transform.node.ts
│   │   │   ├── branch.node.ts
│   │   │   ├── integration.node.ts
│   │   │   ├── kb.node.ts
│   │   │   ├── ai.node.ts
│   │   │   └── code.node.ts      # needsSandbox: true — the only one
│   │   └── index.ts
│   ├── workflow-json/
│   │   └── schema.ts             # the workflow JSON format itself: versioning,
│   │                             # content hash, the shape execution-worker
│   │                             # reads and run-gateway's token scoping checks against
│   └── index.ts
├── package.json
└── tsconfig.json
```

A node's definition here is a schema and metadata only, never the actual execution logic — the `graph/nodes/*.node.ts` files inside `execution-worker` (and `run-gateway` for the sandbox side of `code.node.ts`) hold the real implementation, importing the matching entry from `node-registry.ts` to validate inputs/outputs against and to check `needsSandbox` before deciding whether to call out. This keeps the registry a single source of truth for "what node types exist" while letting the two apps stay the only place actual node behavior runs.

Adding a new node type going forward means one new file under `runtime/src/nodes/definitions/`, one new file under `execution-worker/src/graph/nodes/`, and — only if `needsSandbox` is true — the matching handler on `run-gateway`'s side. Everything else that reads the registry (the dashboard's node palette, via `platform-api`) picks up the new type automatically.

## Shared shape across all three

- `nest-cli.json` in each, same as `platform-api`, even for the two apps with no HTTP surface — keeps `nest build` and the module/provider DI pattern consistent everywhere.
- `tsconfig.json` extends `@linea/config`'s base config rather than repeating compiler options.
- `test/` holds e2e specs; unit specs live next to the file they test as `*.spec.ts`, same as `platform-api`.
- `health/health.controller.ts` (or a bare liveness check for the two non-HTTP apps) in all three, since the hosting layer needs a consistent way to know each fleet is alive regardless of whether it serves real traffic.
- None of the three should import from each other directly. Anything two of them need in common belongs in a `packages/*` package, not a cross-app import — that's the boundary Turborepo's task graph and the deploy-independence goal both depend on.

## What's still a stub and needs the same treatment later

`packages/db/src` has an auth schema but none of the runtime tables — that's the actual next step before any of the three apps above can do real work, since `checkpoints.service.ts`, `memory-extract.service.ts`, `kb.repository.ts`, and `token.guard.ts` all read/write through it. The schema needs the execution tables (`workflows`, `workflow_versions`, `executions`, `execution_steps`, `checkpoints`, `schedules`, `secrets`, `api_keys`), and later a `kb_data` piece for documents, chunks, and vectors. `packages/connectors`, `sandbox-provider`, `queue`, `sdk`, and `sdk-react` are all empty `package.json` stubs with no `src/` — each needs its own internal structure written up the same way this doc did for the three apps and for `ai`/`runtime`/`kb` above, once `packages/db`'s schema exists to build against. `packages/ai` is scaffolded and ready for provider/registry code to land. `packages/kb` doesn't exist in the workspace yet at all and needs scaffolding (`mkdir -p packages/kb/src/{upload,embedding,search,store}`, plus a `package.json` following `packages/db`'s shape) before any code lands in it.

`roadmap.md` sequences all of the above into phases, `poc-phase-0.md` specifies which of these pieces land first and to what standard, and `execution-architecture.md` specifies the runtime schema itself — every table above named as still-missing, in full column and index detail.

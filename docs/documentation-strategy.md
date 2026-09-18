# Documentation strategy

Companion to `roadmap.md`. That doc sequences the product; this one
sequences documentation for it, and states which doc lives where.

## Three surfaces, not one

"Documentation" collapses three different audiences that need different
homes, different tooling, and — most importantly — different start dates.
Writing one before its gating condition is real produces fiction, not
documentation.

| Surface              | Audience                                   | Home                                  | Starts when                              |
| -------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------- |
| Contributor docs     | Whoever is working on this repo            | `CONTRIBUTING.md` / `AGENTS.md`       | Now — already exists, needs upkeep       |
| User docs            | Someone building a workflow in the product | `apps/docs`                           | Incrementally as product surfaces land   |
| API / developer docs | Someone integrating via SDK or REST        | `apps/docs`, generated where possible | Incrementally from Phase 0 item 6 onward |

## Contributor docs: fix continuously, don't split out

`CONTRIBUTING.md` and `AGENTS.md` are the right home for this and should stay
that way. A two-person team doesn't need a documentation site for docs a
browser and `grep` already serve, and a separate site is one more thing to
keep in sync — which is exactly the failure this section is naming.

**The concrete problem this doc is a response to:** `CONTRIBUTING.md`'s
project-structure section listed `execution-worker` and `run-gateway` as
"scaffolded, not yet built" after `packages/runtime` and `packages/db`'s
repository layer had already landed. Three merged PRs was enough for it to
drift. There is no tooling fix for this proportionate to team size — the fix
is a habit: **whoever's PR changes what's a stub versus what's real updates
that section in the same PR.** `CONTRIBUTING.md` now says this explicitly.

One addition planned, not written yet: once `execution-worker` exists (Phase
0 item 4), add a page walking through how a workflow actually runs end to
end. `AGENTS.md` covers coding rules and `execution-architecture.md` covers
the schema in isolation; neither explains the runtime path connecting them.
Not worth writing before there's a real path to describe.

### Per-module `MODULE.md`

Right now, "how does `packages/runtime`'s walker actually behave" lives in
one PR description and scattered TSDoc — nowhere someone lands by default.
A `MODULE.md` at `packages/<name>/MODULE.md` fixes that, but only for
packages where it earns its keep.

**Scope it.** Not every package needs one. `packages/types` or
`packages/config` don't — their contents are self-evident from filenames.
Write one where a reader would otherwise have to read every file to
understand a real design decision: `packages/runtime` (why the walker
resumes the way it does, why the registry holds no execution logic),
`packages/db` (the tenant-scoping composite foreign keys, why
`execution_steps` is shaped like an OTel span).

**Same update discipline as the `CONTRIBUTING.md` fix above, stated
explicitly so it doesn't need rediscovering:** a PR that changes a module's
behavior updates its `MODULE.md` in the same PR. No index to maintain — the
convention is the lookup (`packages/<name>/MODULE.md`, check if it exists).

**Keep it structural, not prose.** One page, four sections:

```markdown
# packages/runtime

What it does, one sentence.

## Non-obvious invariants

Bullet list — a hidden constraint, a design decision that would surprise
a reader, something enforced in code that isn't obvious from reading any
one file in isolation.

## Public surface

The exports someone outside this package actually calls.

## Deliberately not here

What's missing on purpose, and which phase adds it.
```

This is a mechanism inside contributor docs, not a fourth surface — still
something a browser and `grep` serve, just organized per-package instead of
centrally.

## User docs: follow implemented product surfaces

Write user guides only for implemented product surfaces. The documentation
site can exist before the visual builder because it also owns architecture,
security, API concepts, and contributor knowledge; workflow-authoring guides
remain gated on the builder behavior they describe.

`linea-org/linea-mvp` — the prior, sunset system this rebuild replaces —
already worked out a documentation IA worth reusing: `apps/docs`, built on
Fumadocs (Next.js + MDX), organized as

- `nodes/` — one reference page per node type
- `modules/` — feature guides (workflows, executions, memory, knowledge, SDK)
- `reference/` — API reference
- a getting-started walkthrough

The structure is sound and worth keeping. The content is not reusable as-is:
it documents 24 node types against a system that shipped roughly three of
them before being sunset, and the domain it claimed to be live at
(`docs.getlinea.ai`) doesn't resolve — it was never actually deployed. Reuse
the shape, write the words fresh against whatever Phase 1 actually ships.

## API / developer docs: start earlier, mostly generate

This is the one surface worth starting before its "obvious" gate. The SDK is
Phase 5, but `platform-api` gets real REST endpoints in Phase 0 item 6
(`workflows`, `executions`, `triggers`) — long before anything wraps them.

**Generate the reference from the public operation registry, don't hand-write
it.** `packages/protocol` owns public methods, paths, schemas, errors, and
visibility, so OpenAPI should be a deterministic artifact of those definitions
rather than a second copy someone has to remember to update. This fixes the
same class of drift described above for `CONTRIBUTING.md`. Hand-write only what
cannot be generated: guides, concepts, and the "why," not the endpoint list.

Sequencing: OpenAPI generation can start from the existing public operation
registry. Publishing it anywhere public waits until the public API is ready to
support as a compatibility contract, but CI can verify it earlier.

## Tooling: Fumadocs

`apps/docs` uses Fumadocs with Next.js and MDX, matching `linea-mvp`'s
validated choice. It supports local search, Markdown tables, Mermaid diagrams,
page navigation, and editable content in the repository. This is a second
frontend framework alongside `apps/web`'s TanStack Start, a deliberate tradeoff
for documentation-specific content processing and navigation.

The site starts with real architecture, security, API, and contribution
content. User-facing workflow guides are added only when the corresponding
product behavior exists.

## Summary: what to do, and when

| Now                                                                                                                                           | Phase 1                                         | Phase 5                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Keep `CONTRIBUTING.md`, `AGENTS.md`, and `apps/docs` current; generate API artifacts from protocol definitions; write `MODULE.md` when earned | Write user docs against the real visual builder | Publish the generated API reference; write SDK guides |

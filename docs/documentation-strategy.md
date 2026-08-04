# Documentation strategy

Companion to `roadmap.md`. That doc sequences the product; this one
sequences documentation for it, and states which doc lives where.

## Three surfaces, not one

"Documentation" collapses three different audiences that need different
homes, different tooling, and — most importantly — different start dates.
Writing one before its gating condition is real produces fiction, not
documentation.

| Surface              | Audience                                   | Home                                           | Starts when                              |
| -------------------- | ------------------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| Contributor docs     | Whoever is working on this repo            | `CONTRIBUTING.md` / `AGENTS.md`                | Now — already exists, needs upkeep       |
| User docs            | Someone building a workflow in the product | `apps/docs` (future)                           | Phase 1, when the visual builder exists  |
| API / developer docs | Someone integrating via SDK or REST        | `apps/docs` (future), generated where possible | Incrementally from Phase 0 item 6 onward |

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

## User docs: gated on the builder existing

Don't start before Phase 1. Writing "how to build a workflow" against a
product with no visual builder is fiction, and it would need to be rewritten
once the builder's actual constraints are known regardless.

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

**Generate the reference from the controllers, don't hand-write it.** Wire up
`@nestjs/swagger` on `platform-api`'s controllers as soon as they exist, so
the API reference is a build artifact of the actual code rather than a
second copy of it someone has to remember to update. This is the direct fix
for the same class of problem the contributor-docs section above just
described happening to `CONTRIBUTING.md` — the difference is that generated
docs structurally can't drift the same way. Hand-write only what can't be
generated: guides, concepts, the "why," not the endpoint list.

Sequencing: OpenAPI generation can start the moment `platform-api` has its
first real controller (Phase 0). Publishing it anywhere public waits until
there's a public API worth exposing (Phase 5), but there's no reason not to
have it generating into CI output long before that.

## Tooling: Fumadocs, deferred until there's content

When `apps/docs` actually gets built — Phase 1 for the user-docs half, sooner
in spirit for the generated API reference — use Fumadocs, matching
`linea-mvp`'s validated choice. It's a Next.js app, which means a second
frontend framework alongside `apps/web`'s TanStack Start. That's a normal
pattern for documentation sites (Stripe and Vercel both do it) and not an
architectural conflict, but it is a deliberate choice worth naming rather
than defaulting into: one more app to build, deploy, and keep running.

**Do not scaffold `apps/docs` now.** Same discipline the roadmap already
applies elsewhere — the web trace UI and the visual builder are both cut
from Phase 0 for the identical reason: building a surface before there's
real content to put in it is pure overhead. An empty docs site teaches
nothing and is one more thing to maintain through every phase between now
and when it has something to say.

## Summary: what to do, and when

| Now                                                                     | Phase 0 (rest of it)                                                | Phase 1                                                                   | Phase 5                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Keep `CONTRIBUTING.md`/`AGENTS.md` current, in the PR that changes them | Wire `@nestjs/swagger` onto `platform-api` controllers as they land | Scaffold `apps/docs` (Fumadocs); write user docs against the real builder | Publish the generated API reference; write SDK guides |

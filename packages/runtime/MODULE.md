# packages/runtime

Defines the workflow JSON format, the node type registry, and the graph
walker — the part of the system that decides what runs next, never the part
that actually runs it.

## Non-obvious invariants

- **Resuming a walk is calling `startWalk()` again with a populated `completed`
  map.** There is no separate resume mode, no branch in the code path — the
  same function produces the same remaining step sequence whether it's
  running fresh or picking up after a crash. This is the property
  `interpreter/walker.spec.ts` tests directly.
- **The node registry holds schema and `needsSandbox` metadata only, never
  execution logic.** Actual node behavior lives in `apps/execution-worker`.
  This is deliberate, not an oversight — see `repo-structure.md`. It's also
  the reason this package has no dependency on any AI provider SDK, any
  sandbox client, or `@linealabs/db`.
- **A node's input is always its single predecessor's output**, except the
  entry node, whose input is the trigger payload. Every non-entry node must
  have exactly one incoming edge, except a merge node, which has exactly two
  from distinct sources — `validate-graph.ts` enforces this, and the walker
  assumes it without re-checking.
- **`validateGraphStructure` is a separate, mandatory pass**, not folded
  into the zod schema, because it checks things zod can't express: id
  uniqueness, edge references, reachability from the entry node, no cycles
  (including ones in a component disconnected from the entry node — the
  degree checks alone don't catch that), and that a branch node's outgoing
  edges have distinct, present conditions. Call it once, at publish time —
  don't skip it and rely on the walker's own runtime errors to catch a bad
  graph, since those are less specific and fire mid-walk.

- **The walker offers every ready step and never limits how many run.** The
  execution-worker decides that (ADR 0028).

## Public surface

`workflowGraphSchema`, `hashWorkflowGraph`, `validateGraphStructure`,
`nodeRegistry`, `startWalk()`. Everything else is an implementation detail.

## Deliberately not here

The code node and anything `needsSandbox: true` — those wait for a sandbox.
This package only defines the format the builder produces and the
execution-worker consumes.

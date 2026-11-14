import type { NodeType } from "@linea/runtime"

/** How a Replay or Regression run may dispatch each node type until ADR 0024's recorded-effect layer exists; exhaustive so a new node type must choose. */
export const diagnosticDispatch: Record<
  NodeType,
  "no-external-write" | "writes-refused" | "refused"
> = {
  start: "no-external-write",
  end: "no-external-write",
  transform: "no-external-write",
  branch: "no-external-write",
  filter: "no-external-write",
  merge: "no-external-write",
  datetime: "no-external-write",
  variables: "no-external-write",
  extract: "no-external-write",
  evaluator: "no-external-write",
  http: "writes-refused",
  ai: "writes-refused",
  memory: "writes-refused",
  connector: "refused",
  agent: "refused",
  approval: "refused",
  wait: "refused",
}

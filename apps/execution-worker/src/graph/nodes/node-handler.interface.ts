export type NodeExecutionContext = {
  workspaceId: string
  /** Stable across a reclaim of the same node execution (executionId:nodeId, or the replay step id) — handlers making outbound requests should send it as an idempotency key so a compliant destination can recognize a retried request instead of repeating a real mutation. */
  idempotencyKey?: string
  /** Aborted when the caller loses ownership mid-call (a lost lease, a lost replay claim) — handlers making outbound requests should pass it through so loss stops the actual request, not just the bookkeeping. */
  signal?: AbortSignal
  /** Only populated for handlers that need to pause/resume against their own row (the approval node) — most handlers don't need these. */
  executionId?: string
  nodeId?: string
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}

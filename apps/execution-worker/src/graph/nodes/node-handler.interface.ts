export type NodeExecutionContext = {
  workspaceId: string
  /** Aborted when the caller loses ownership mid-call (a lost lease, a lost replay claim) — handlers making outbound requests should pass it through so loss stops the actual request, not just the bookkeeping. */
  signal?: AbortSignal
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}

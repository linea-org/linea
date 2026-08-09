export type NodeExecutionContext = {
  workspaceId: string
  /** Aborted when the caller loses ownership of the work mid-call (a lost execution lease, a
   * lost replay claim) — handlers that make outbound requests should pass it through so that
   * loss stops the actual request, not just the bookkeeping around it. */
  signal?: AbortSignal
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}

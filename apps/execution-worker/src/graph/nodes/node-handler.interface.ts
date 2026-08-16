export type NodeExecutionContext = {
  workspaceId: string
  /** Stable across a reclaim of the same node execution (executionId:nodeId, or the replay step id) — handlers making outbound requests should send it as an idempotency key so a compliant destination can recognize a retried request instead of repeating a real mutation. */
  idempotencyKey?: string
  /** Aborted when the caller loses ownership mid-call (a lost lease, a lost replay claim) — handlers making outbound requests should pass it through so loss stops the actual request, not just the bookkeeping. */
  signal?: AbortSignal
  /** Set when the triggering execution's payload carries a conversationId (chat preview) — lets a handler like AiNode fetch prior turns for message history. */
  conversationId?: string
  /** The workflow this execution belongs to — set whenever conversationId is, so a handler can scope a conversation lookup by workflow, not just workspace. */
  workflowId?: string
  /** The specific chat message row (set by sendChatMessage in triggerPayload) that this execution is answering — lets AiNode identify its own turn instead of assuming "whichever message is latest," which breaks if a second turn is submitted before this execution's AI node runs. */
  chatMessageId?: string
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}

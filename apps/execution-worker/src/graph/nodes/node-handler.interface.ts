export type NodeExecutionContext = {
  workspaceId: string
  /** Stable across a reclaim of the same node execution (executionId:nodeId, or the replay step id) — handlers making outbound requests should send it as an idempotency key so a compliant destination can recognize a retried request instead of repeating a real mutation. */
  idempotencyKey?: string
  /** Aborted when the caller loses ownership mid-call (a lost lease, a lost replay claim) — handlers making outbound requests should pass it through so loss stops the actual request, not just the bookkeeping. */
  signal?: AbortSignal
  /** Only populated for handlers that need to pause/resume against their own row (the approval node) — most handlers don't need these. */
  executionId?: string
  nodeId?: string
  /** The current lease owner, set only on the real run path (never for step-level replay). A handler persisting its own mid-execution state should condition the write on this still matching the execution's lease at commit time, not just when the handler started. */
  leasedBy?: string
  /** Set when the triggering execution's payload carries a conversationId (chat preview) — lets a handler like AiNode fetch prior turns for message history. */
  conversationId?: string
  /** The workflow this execution belongs to — set whenever conversationId is, so a handler can scope a conversation lookup by workflow, not just workspace. */
  workflowId?: string
  /** Immutable workflow version used to cache generated Evaluator metric steps across executions. */
  workflowVersionId?: string
  /** The specific chat message row (set by sendChatMessage in triggerPayload) that this execution is answering — lets AiNode identify its own turn instead of assuming "whichever message is latest," which breaks if a second turn is submitted before this execution's AI node runs. */
  chatMessageId?: string
  /** Eval-only: a conversation-type eval case's frozen turn snapshot — when set, AiNode replays this directly instead of looking up conversationId from chat_messages, since there's no live conversation backing an eval run. externalSubjectId (from the source finding's own conversation, if it had one) lets memory recall work during eval too — there's no real input object for memorySubjectPath to resolve against otherwise. */
  evalConversation?: {
    turns: { role: "user" | "assistant"; content: string }[]
    finalPrompt: string
    externalSubjectId?: string
  }
  /** Workflow-scoped state as of this step, written by "variables"/set steps and readable by
   * every handler regardless of graph position — the one channel that reaches beyond a node's own
   * immediate predecessor. Only the variables node's own handler is expected to derive a new state
   * from this (returned as its output, then adopted by the interpreter); other handlers get it
   * read-only for their own internal use, not as something they write back into. */
  variables?: Record<string, unknown>
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}

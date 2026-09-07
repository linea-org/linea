import { createServerFn } from "@tanstack/react-start"
import { apiFetch } from "./api-fetch"

export type ConversationMessage = {
  id: string
  executionId: string | null
  role: "user" | "assistant"
  content: string
  sequence: number
  createdAt: string
}

export type ConversationFinding = {
  id: string
  axis: string
  category: string
  confidence: number
  evidenceMessageId: string | null
  rationale: string | null
  createdAt: string
}

export type ConversationAnalysisMetadata = {
  id: string
  analyzedThroughSequence: number
  analyzerVersion: string
  model: string | null
  provider: string | null
  tokensInput: number
  tokensOutput: number
  costMicros: string
  createdAt: string
}

type ConversationAnalysisBase = {
  conversation: {
    id: string
    externalSubjectId: string | null
    messages: ConversationMessage[]
  }
}

type AvailableConversationAnalysis = ConversationAnalysisBase & {
  analysis: ConversationAnalysisMetadata
  findings: ConversationFinding[]
}

type CompletedConversationAnalysis = AvailableConversationAnalysis & {
  status: "complete"
}

type SampledOutConversationAnalysis = AvailableConversationAnalysis & {
  status: "sampled_out"
}

type MissingConversationAnalysis = ConversationAnalysisBase & {
  analysis: null
  findings: []
  attempt: {
    attemptCount: number
    lastAttemptAt: string
  } | null
}

type PendingConversationAnalysis = MissingConversationAnalysis & {
  status: "pending"
}

type UnavailableConversationAnalysis = MissingConversationAnalysis & {
  status: "unavailable"
}

type DisabledConversationAnalysis = MissingConversationAnalysis & {
  status: "disabled"
}

export type ConversationAnalysisResponse =
  | CompletedConversationAnalysis
  | SampledOutConversationAnalysis
  | PendingConversationAnalysis
  | UnavailableConversationAnalysis
  | DisabledConversationAnalysis

export const getConversationAnalysisFn = createServerFn({ method: "GET" })
  .validator((data: { workflowId: string; conversationId: string }) => data)
  .handler(async ({ data }): Promise<ConversationAnalysisResponse> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/conversations/${data.conversationId}/analysis`
    )
    if (res.status === 401 || res.status === 403) {
      throw new Error("You do not have access to this conversation analysis")
    }
    if (!res.ok) {
      throw new Error("Conversation analysis not found")
    }
    return (await res.json()) as ConversationAnalysisResponse
  })

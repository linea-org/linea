import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ConversationAnalysisResponse } from "@/lib/conversation-analyses-api"
import {
  ConversationAnalysisError,
  ConversationAnalysisView,
} from "./conversation-analysis-view"

const completeAnalysis: ConversationAnalysisResponse = {
  status: "complete",
  conversation: {
    id: "conversation-1",
    externalSubjectId: "customer-42",
    messages: [
      {
        id: "message-1",
        executionId: "execution-1",
        role: "user",
        content: "You have repeated the same answer three times.",
        sequence: 1,
        createdAt: "2026-09-06T12:00:00.000Z",
      },
      {
        id: "message-2",
        executionId: "execution-1",
        role: "assistant",
        content: "Please try the same steps again.",
        sequence: 2,
        createdAt: "2026-09-06T12:00:01.000Z",
      },
    ],
  },
  analysis: {
    id: "analysis-1",
    analyzedThroughSequence: 2,
    analyzerVersion: "v2",
    model: "openai/gpt-oss-20b",
    provider: "groq",
    tokensInput: 120,
    tokensOutput: 24,
    costMicros: "19",
    createdAt: "2026-09-06T12:01:00.000Z",
  },
  findings: [
    {
      id: "finding-1",
      axis: "agent_behaviour",
      category: "repetition_loop",
      confidence: 0.94,
      evidenceMessageId: "message-1",
      rationale: "The user explicitly reports repeated failed advice.",
      createdAt: "2026-09-06T12:01:00.000Z",
    },
    {
      id: "finding-2",
      axis: "user_experience",
      category: "frustrated",
      confidence: 0.91,
      evidenceMessageId: "message-1",
      rationale: "The user reports repeated failed advice.",
      createdAt: "2026-09-06T12:01:00.000Z",
    },
  ],
}

describe("ConversationAnalysisView", () => {
  it("renders findings, cited transcript evidence, and analyzer metadata", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisView analysis={completeAnalysis} />
    )
    expect(html).toContain("Agent behaviour")
    expect(html).toContain("User experience")
    expect(html).toContain("Repetition loop")
    expect(html).toContain("94% confidence")
    expect(html).toContain(
      "The user explicitly reports repeated failed advice."
    )
    expect(html).toContain("You have repeated the same answer three times.")
    expect(html).toContain("openai/gpt-oss-20b")
    expect(html).toContain("groq")
    expect(html).toContain("120 input")
    expect(html).toContain("24 output")
    expect(html).toContain("19 µUSD")
    expect(html).toContain("Analyzed through message 2")
    expect(html).toContain("Analyzed at")
  })

  it("distinguishes an analyzed conversation with no findings", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisView
        analysis={{ ...completeAnalysis, findings: [] }}
      />
    )
    expect(html).toContain("Analysis complete")
    expect(html).toContain("No notable behavior findings")
  })

  it("explains when a conversation was sampled out", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisView
        analysis={{
          ...completeAnalysis,
          status: "sampled_out",
          analysis: {
            ...completeAnalysis.analysis,
            analyzerVersion: "sampled-out",
            model: null,
            provider: null,
            tokensInput: 0,
            tokensOutput: 0,
            costMicros: "0",
          },
          findings: [],
        }}
      />
    )
    expect(html).toContain("Sampled out")
    expect(html).toContain("not selected for model analysis")
    expect(html).toContain("You have repeated the same answer three times.")
  })

  it("explains when analysis is pending", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisView
        analysis={{
          status: "pending",
          conversation: completeAnalysis.conversation,
          analysis: null,
          findings: [],
          attempt: null,
        }}
      />
    )
    expect(html).toContain("Analysis pending")
    expect(html).toContain("has not been analyzed yet")
    expect(html).toContain("You have repeated the same answer three times.")
  })

  it("surfaces an unavailable analysis without hiding the conversation", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisView
        analysis={{
          status: "unavailable",
          conversation: completeAnalysis.conversation,
          analysis: null,
          findings: [],
          attempt: {
            attemptCount: 2,
            lastAttemptAt: "2026-09-06T12:01:00.000Z",
          },
        }}
      />
    )
    expect(html).toContain("Analysis unavailable")
    expect(html).toContain("2 attempts")
    expect(html).toContain("will retry automatically")
    expect(html).toContain("You have repeated the same answer three times.")
  })

  it("explains when the operator is not authorized to view the conversation", () => {
    const html = renderToStaticMarkup(
      <ConversationAnalysisError
        error={
          new Error("You do not have access to this conversation analysis")
        }
      />
    )
    expect(html).toContain("Access denied")
    expect(html).toContain("do not have access")
  })
})

import type { CompletionRequest, CompletionResult } from "@linea/ai"

const complete = jest.fn<
  Promise<CompletionResult>,
  [string, CompletionRequest]
>()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "ANTHROPIC_API_KEY")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))
const calculateCostMicros = jest.fn(() => 42n)
const providers = [
  { id: "anthropic", label: "Anthropic", keyName: "ANTHROPIC_API_KEY" },
]

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
  calculateCostMicros,
  providers,
}))

import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import {
  ConversationAnalyzerService,
  parseFindings,
} from "./conversation-analyzer.service"

afterAll(async () => {
  await pool.end()
})

beforeEach(() => {
  complete.mockReset()
  calculateCostMicros.mockReturnValue(42n)
})

async function setUpConversation(options: {
  name: string
  enabled: boolean
  sampleRate?: number
}) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: options.name,
      slug: `${options.name}-${suffix}`,
      createdAt: new Date(),
    })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Behaviour Test Workflow",
    slug: `behaviour-test-${suffix}`,
  })

  if (options.enabled) {
    await repositories.workspaceSettings.updateWorkspaceSettings(
      db,
      organization.id,
      {
        behaviourAnalysisEnabled: true,
        behaviourSampleRate: options.sampleRate ?? 1,
      }
    )
  }

  const conversationId = randomUUID()
  const idleAt = new Date(Date.now() - 60 * 60_000)
  const [message] = await db
    .insert(schema.chatMessages)
    .values({
      workspaceId: organization.id,
      workflowId: workflow.id,
      conversationId,
      role: "user",
      content: "I've been trying to cancel my subscription for an hour",
      createdAt: idleAt,
    })
    .returning()

  return { organization, workflow, conversationId, message }
}

describe("ConversationAnalyzerService", () => {
  it("returns persisted usage metadata for an explicitly selected conversation", async () => {
    const { organization, workflow, conversationId, message } =
      await setUpConversation({
        name: "Behaviour Explicit Validation Test Org",
        enabled: true,
      })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 100,
      tokensOutput: 20,
      toolCalls: [
        { id: "call-1", name: "report_findings", arguments: { findings: [] } },
      ],
    })
    try {
      const service = new ConversationAnalyzerService()
      const outcome = await service.analyzeConversation({
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        maxSequence: message.sequence,
        externalSubjectId: null,
        behaviourSampleRate: 1,
        behaviourModel: null,
      })
      expect(outcome.outcome).toBe("processed")
      if (outcome.outcome !== "processed") throw new Error("Expected analysis")
      expect(outcome.analysisId).toMatch(/^[0-9a-f-]{36}$/)
      expect(outcome.model).toBe("claude-haiku-4-5-20251001")
      expect(outcome.tokensInput).toBe(100)
      expect(outcome.tokensOutput).toBe(20)
      expect(outcome.costMicros).toBe(42n)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("analyzes an idle, enabled conversation, persists findings, and does not re-pick it up on a second poll", async () => {
    const { organization, workflow, conversationId, message } =
      await setUpConversation({
        name: "Behaviour Analyze Test Org",
        enabled: true,
      })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 100,
      tokensOutput: 20,
      toolCalls: [
        {
          id: "call-1",
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "user_experience",
                category: "frustrated",
                confidence: 0.85,
                evidenceMessageId: "m1",
                rationale: "Explicitly says they've been stuck for an hour",
              },
            ],
          },
        },
      ],
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      expect(complete).toHaveBeenCalledTimes(1)
      expect(complete).toHaveBeenCalledWith(
        "secret",
        expect.objectContaining({ model: "claude-haiku-4-5-20251001" })
      )
      // Bounded well under the claim lease, so a genuinely-running call can never outlive it.
      const request = complete.mock.calls[0][1]
      expect(request.tools?.[0].parameters).toMatchObject({
        properties: {
          findings: {
            items: {
              properties: {
                evidenceMessageId: { type: "string", enum: ["m1"] },
              },
            },
          },
        },
      })
      expect(request.signal).toBeInstanceOf(AbortSignal)
      expect(request.signal?.aborted).toBe(false)

      const [analysis] = await getAnalysisFor(conversationId)
      expect(analysis.analyzerVersion).toBe("v2")
      expect(analysis.costMicros).toBe(42n)

      const findings = await getFindingsFor(analysis.id)
      expect(findings).toHaveLength(1)
      expect(findings[0].category).toBe("frustrated")
      expect(findings[0].evidenceMessageId).toBe(message.id)

      const [flag] = await getFlagsFor(organization.id)
      expect(flag).toBeDefined()
      expect(flag.flagType).toBe("user_frustration")
      expect(flag.model).toBe("claude-haiku-4-5-20251001")
      expect(flag.provider).toBe("anthropic")
      expect(flag.dedupeKey).toBe(`user_frustration:${conversationId}`)

      await service.poll()
      expect(complete).toHaveBeenCalledTimes(1)
      expect(await getFlagsFor(organization.id)).toHaveLength(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      void workflow
    }
  })

  it("does not raise a flag for a finding category outside the curated set", async () => {
    const { organization, conversationId } = await setUpConversation({
      name: "Behaviour Uncurated Category Test Org",
      enabled: true,
    })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 10,
      tokensOutput: 10,
      toolCalls: [
        {
          id: "call-1",
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "user_experience",
                category: "confused",
                confidence: 0.6,
                evidenceMessageId: "m1",
                rationale: "The user does not understand the response.",
              },
            ],
          },
        },
      ],
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      const [analysis] = await getAnalysisFor(conversationId)
      const findings = await getFindingsFor(analysis.id)
      expect(findings).toHaveLength(1)
      expect(await getFlagsFor(organization.id)).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("skips the LLM call and records a sampled-out analysis when sampleRate is 0", async () => {
    const { organization, conversationId } = await setUpConversation({
      name: "Behaviour Sample Test Org",
      enabled: true,
      sampleRate: 0,
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      expect(complete).not.toHaveBeenCalled()

      const [analysis] = await getAnalysisFor(conversationId)
      expect(analysis.analyzerVersion).toBe("sampled-out")
      expect(analysis.costMicros).toBe(0n)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("never analyzes a workspace that has not enabled behaviour analysis", async () => {
    const { organization, conversationId } = await setUpConversation({
      name: "Behaviour Disabled Test Org",
      enabled: false,
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      expect(complete).not.toHaveBeenCalled()
      const rows = await getAnalysisFor(conversationId)
      expect(rows).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not loop forever on a persistently-failing conversation within one poll, and retries it once its claim lease expires", async () => {
    const { organization, conversationId } = await setUpConversation({
      name: "Behaviour Persistent Failure Test Org",
      enabled: true,
    })
    complete.mockRejectedValue(new Error("provider is down"))

    try {
      const service = new ConversationAnalyzerService()
      // Would hang forever pre-fix: the failing conversation's watermark never advances, so the
      // drain loop's own requery kept re-selecting it inside the same poll() call.
      await service.poll()
      expect(complete).toHaveBeenCalledTimes(1)

      const rows = await getAnalysisFor(conversationId)
      expect(rows).toHaveLength(0)

      // Still holds its claim (a failed attempt backs off for the claim's lease duration, not
      // just until the next tick — a real crash-recovery lease has to be long enough to survive
      // a genuinely slow provider call, not just "one 60s poll interval") — an immediate second
      // poll must not retry it yet.
      await service.poll()
      expect(complete).toHaveBeenCalledTimes(1)

      // Once the claim goes stale (simulated here rather than a real multi-minute wait), the next
      // poll picks it back up rather than skipping it forever.
      await pool.query(
        "UPDATE conversation_analysis_claims SET claimed_at = $1 WHERE conversation_id = $2",
        [new Date(Date.now() - 60 * 60_000), conversationId]
      )
      await service.poll()
      expect(complete).toHaveBeenCalledTimes(2)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("skips a conversation another worker already has an active claim on, without calling the LLM", async () => {
    const { organization, workflow, conversationId } = await setUpConversation({
      name: "Behaviour Already Claimed Test Org",
      enabled: true,
    })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 1,
      tokensOutput: 1,
      toolCalls: [{ id: "call-1", name: "report_findings", arguments: {} }],
    })

    try {
      // Simulates another worker instance already mid-analysis of this exact conversation.
      const claim =
        await repositories.conversationAnalysis.claimConversationForAnalysis(
          db,
          {
            workspaceId: organization.id,
            workflowId: workflow.id,
            conversationId,
          }
        )
      expect(claim.outcome).toBe("claimed")

      const service = new ConversationAnalyzerService()
      await service.poll()

      expect(complete).not.toHaveBeenCalled()
      expect(await getAnalysisFor(conversationId)).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("discards its result instead of writing a duplicate analysis when its claim is lost mid-flight to another worker", async () => {
    const { organization, workflow, conversationId } = await setUpConversation({
      name: "Behaviour Lost Claim Test Org",
      enabled: true,
    })
    // Simulates the provider call outliving this worker's own claim lease: by the time it
    // resolves, another worker has already reclaimed (and, in reality, likely already analyzed)
    // this exact conversation.
    complete.mockImplementation(async () => {
      await pool.query(
        "UPDATE conversation_analysis_claims SET claimed_at = $1, attempt_count = attempt_count + 1 WHERE conversation_id = $2",
        [new Date(), conversationId]
      )
      return {
        text: "",
        tokensInput: 1,
        tokensOutput: 1,
        toolCalls: [{ id: "call-1", name: "report_findings", arguments: {} }],
      }
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      expect(complete).toHaveBeenCalledTimes(1)
      // No analysis was persisted for the losing worker's now-stale result.
      expect(await getAnalysisFor(conversationId)).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      void workflow
    }
  })

  it("records a zero-finding analysis rather than throwing when the model never calls report_findings", async () => {
    const { organization, conversationId } = await setUpConversation({
      name: "Behaviour No Tool Call Test Org",
      enabled: true,
    })
    complete.mockResolvedValue({
      text: "just talking",
      tokensInput: 5,
      tokensOutput: 5,
    })

    try {
      const service = new ConversationAnalyzerService()
      await service.poll()

      const [analysis] = await getAnalysisFor(conversationId)
      expect(analysis).toBeDefined()
      const findings = await getFindingsFor(analysis.id)
      expect(findings).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

describe("parseFindings", () => {
  it("maps a short evidence label to the persisted message id", () => {
    const result = parseFindings(
      [
        {
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "agent_behaviour",
                category: "inappropriate_refusal",
                confidence: 0.9,
                evidenceMessageId: "m1",
                rationale: "The assistant refused a harmless request.",
              },
            ],
          },
        },
      ],
      new Map([["m1", "real-message-id"]])
    )
    expect(result[0].evidenceMessageId).toBe("real-message-id")
  })

  it("drops a finding without valid evidence and rationale", () => {
    const result = parseFindings(
      [
        {
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "agent_behaviour",
                category: "instruction_ignored",
                confidence: 0.9,
                rationale: "The response ignored the requested format.",
              },
              {
                axis: "agent_behaviour",
                category: "instruction_ignored",
                confidence: 0.9,
                evidenceMessageId: "real-id",
              },
              {
                axis: "agent_behaviour",
                category: "instruction_ignored",
                confidence: 0.9,
                evidenceMessageId: "other-id",
                rationale: "The response ignored the requested format.",
              },
            ],
          },
        },
      ],
      new Map([["real-id", "real-id"]])
    )
    expect(result).toEqual([])
  })

  it("keeps a well-formed finding and clamps confidence into [0, 1]", () => {
    const result = parseFindings(
      [
        {
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "agent_behaviour",
                category: "hallucination_suspected",
                confidence: 1.5,
                evidenceMessageId: "real-id",
                rationale: "The assistant made an unsupported claim.",
              },
            ],
          },
        },
      ],
      new Map([["real-id", "real-id"]])
    )
    expect(result).toEqual([
      {
        axis: "agent_behaviour",
        category: "hallucination_suspected",
        confidence: 1,
        evidenceMessageId: "real-id",
        rationale: "The assistant made an unsupported claim.",
      },
    ])
  })

  it("drops findings with an invalid axis, missing category, or non-numeric confidence", () => {
    const result = parseFindings(
      [
        {
          name: "report_findings",
          arguments: {
            findings: [
              { axis: "not_a_real_axis", category: "x", confidence: 0.5 },
              { axis: "user_experience", category: "", confidence: 0.5 },
              {
                axis: "user_experience",
                category: "confused",
                confidence: "high",
              },
            ],
          },
        },
      ],
      new Map()
    )
    expect(result).toHaveLength(0)
  })

  it("drops a finding whose evidence doesn't belong to the conversation", () => {
    const result = parseFindings(
      [
        {
          name: "report_findings",
          arguments: {
            findings: [
              {
                axis: "user_experience",
                category: "satisfied",
                confidence: 0.7,
                evidenceMessageId: "not-a-real-id",
                rationale: "The user confirmed the answer helped.",
              },
            ],
          },
        },
      ],
      new Map([["real-id", "real-id"]])
    )
    expect(result).toEqual([])
  })

  it("returns an empty array when report_findings was never called", () => {
    expect(parseFindings(undefined, new Map())).toEqual([])
    expect(
      parseFindings([{ name: "other_tool", arguments: {} }], new Map())
    ).toEqual([])
  })
})

async function getAnalysisFor(conversationId: string) {
  const rows = await db.select().from(schema.conversationAnalyses)
  return rows.filter((row) => row.conversationId === conversationId)
}

async function getFindingsFor(analysisId: string) {
  const rows = await db.select().from(schema.conversationFindings)
  return rows.filter((row) => row.analysisId === analysisId)
}

async function getFlagsFor(workspaceId: string) {
  const rows = await db.select().from(schema.flags)
  return rows.filter((row) => row.workspaceId === workspaceId)
}

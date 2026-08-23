const complete = jest.fn()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "anthropic")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))
const calculateCostMicros = jest.fn(() => 42n)

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
  calculateCostMicros,
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
                evidenceMessageId: message.id,
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

      const [analysis] = await getAnalysisFor(conversationId)
      expect(analysis.analyzerVersion).toBe("v1")
      expect(analysis.costMicros).toBe(42n)

      const findings = await getFindingsFor(analysis.id)
      expect(findings).toHaveLength(1)
      expect(findings[0].category).toBe("frustrated")
      expect(findings[0].evidenceMessageId).toBe(message.id)

      await service.poll()
      expect(complete).toHaveBeenCalledTimes(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      void workflow
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
              },
            ],
          },
        },
      ],
      new Set()
    )
    expect(result).toEqual([
      {
        axis: "agent_behaviour",
        category: "hallucination_suspected",
        confidence: 1,
        evidenceMessageId: undefined,
        rationale: undefined,
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
      new Set()
    )
    expect(result).toHaveLength(0)
  })

  it("drops an evidenceMessageId that doesn't match a real message in this conversation", () => {
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
              },
            ],
          },
        },
      ],
      new Set(["real-id"])
    )
    expect(result[0].evidenceMessageId).toBeUndefined()
  })

  it("returns an empty array when report_findings was never called", () => {
    expect(parseFindings(undefined, new Set())).toEqual([])
    expect(
      parseFindings([{ name: "other_tool", arguments: {} }], new Set())
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

import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  chatMessages,
  conversationFindings,
  executionSteps,
} from "../schema/index.js"
import {
  createConversationAnalysis,
  insertConversationFindings,
} from "./conversation-analysis.repository.js"
import { createExecution, startExecution } from "./execution.repository.js"
import {
  archiveRegressionCase,
  createRegressionCase,
  createRegressionCaseFromFinding,
  createRegressionCaseFromFlag,
  createRegressionCaseFromStep,
  getRegressionCaseById,
  listRegressionCases,
} from "./regression-case.repository.js"
import { createFlagIfNew, getFlagById } from "./flag.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { publishWorkflowVersion } from "./workflow.repository.js"
import type { Transaction } from "./types.js"

async function insertStep(
  tx: Transaction,
  input: {
    executionId: string
    workspaceId: string
    nodeId: string
    input: Record<string, unknown>
  }
): Promise<string> {
  const [step] = await tx
    .insert(executionSteps)
    .values({
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      traceId: randomUUID(),
      spanId: randomUUID(),
      name: input.nodeId,
      startedAt: new Date(),
      nodeId: input.nodeId,
      sequence: 1,
      input: input.input,
    })
    .returning()
  return step.id
}

describe("createRegressionCaseFromStep", () => {
  it("snapshots the step's own input and carries provenance", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      await publishWorkflowVersion(tx, workflow.id, version.id)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )
      const stepId = await insertStep(tx, {
        executionId: execution.id,
        workspaceId: organization.id,
        nodeId: "http-1",
        input: { url: "https://example.com" },
      })

      const sourceSignalId = randomUUID()
      const regressionCase = await createRegressionCaseFromStep(tx, {
        workspaceId: organization.id,
        stepId,
        sourceSignalId,
      })

      expect(regressionCase).toBeDefined()
      expect(regressionCase?.caseType).toBe("node")
      expect(regressionCase?.nodeId).toBe("http-1")
      expect(regressionCase?.input).toEqual({
        nodeInput: { url: "https://example.com" },
      })
      expect(regressionCase?.sourceStepId).toBe(stepId)
      expect(regressionCase?.sourceSignalId).toBe(sourceSignalId)
      expect(regressionCase?.workflowId).toBe(workflow.id)

      // Not visible from another workspace, even with the right stepId.
      const { organization: otherOrg } = await createTestFixtures(tx)
      const fromOtherWorkspace = await createRegressionCaseFromStep(tx, {
        workspaceId: otherOrg.id,
        stepId,
      })
      expect(fromOtherWorkspace).toBeUndefined()
    })
  })

  it("returns undefined for a step that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const result = await createRegressionCaseFromStep(tx, {
        workspaceId: organization.id,
        stepId: randomUUID(),
      })
      expect(result).toBeUndefined()
    })
  })
})

describe("createRegressionCaseFromFinding", () => {
  it("snapshots every turn up to the user message that triggered a problematic assistant reply", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()

      const [turn1] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "What's your refund policy?",
        })
        .returning()
      await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "assistant",
          content: "We offer refunds within 30 days.",
          respondsToMessageId: turn1.id,
        })
        .returning()
      const [turn3] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "What about after 30 days?",
        })
        .returning()
      const [turn4] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "assistant",
          content: "Sure, I can process that refund for you right now.",
          respondsToMessageId: turn3.id,
        })
        .returning()

      const analysis = await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: "customer-user-1",
        analyzedThroughSequence: turn4.sequence,
        analyzerVersion: "v1",
      })
      await insertConversationFindings(tx, analysis.id, [
        {
          workspaceId: organization.id,
          axis: "agent_behaviour",
          category: "hallucination_suspected",
          confidence: 0.8,
          evidenceMessageId: turn4.id,
          rationale: "Contradicts its own earlier stated policy",
        },
      ])
      const [finding] = await tx
        .select()
        .from(conversationFindings)
        .where(eq(conversationFindings.analysisId, analysis.id))

      const regressionCase = await createRegressionCaseFromFinding(tx, {
        workspaceId: organization.id,
        findingId: finding.id,
      })

      expect(regressionCase).toBeDefined()
      expect(regressionCase?.caseType).toBe("conversation")
      expect(regressionCase?.sourceFindingId).toBe(finding.id)
      const input = regressionCase?.input as {
        turns: { role: string; content: string }[]
        finalPrompt: string
        externalSubjectId?: string
      }
      // Boundary is turn3 (the user message that produced the hallucinated reply) — history is
      // everything before it (turn1, turn2), not the hallucinated reply itself.
      expect(input.finalPrompt).toBe("What about after 30 days?")
      expect(input.turns.map((t) => t.content)).toEqual([
        "What's your refund policy?",
        "We offer refunds within 30 days.",
      ])
      // Carried through from the source analysis so replaying this case can still exercise
      // memory recall for a memorySubjectPath-configured agent.
      expect(input.externalSubjectId).toBe("customer-user-1")
      expect(regressionCase?.assertions).toEqual([
        {
          type: "llm_judge",
          config: {
            rubric:
              'Check whether the replayed conversation still exhibits "hallucination_suspected": Contradicts its own earlier stated policy',
          },
        },
      ])

      // Not visible from another workspace, even with the right findingId.
      const { organization: otherOrg } = await createTestFixtures(tx)
      const fromOtherWorkspace = await createRegressionCaseFromFinding(tx, {
        workspaceId: otherOrg.id,
        findingId: finding.id,
      })
      expect(fromOtherWorkspace).toBeUndefined()
    })
  })

  it("returns undefined for a finding that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const result = await createRegressionCaseFromFinding(tx, {
        workspaceId: organization.id,
        findingId: randomUUID(),
      })
      expect(result).toBeUndefined()
    })
  })
})

describe("createRegressionCaseFromFlag", () => {
  it("snapshots the conversation from a flag's own detail JSON, no finding lookup needed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()

      const [turn1] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "What's your refund policy?",
        })
        .returning()
      await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "assistant",
          content: "We offer refunds within 30 days.",
          respondsToMessageId: turn1.id,
        })
        .returning()
      const [turn3] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "What about after 30 days?",
        })
        .returning()
      const [turn4] = await tx
        .insert(chatMessages)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "assistant",
          content: "Sure, I can process that refund for you right now.",
          respondsToMessageId: turn3.id,
        })
        .returning()

      const flag = await createFlagIfNew(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        flagType: "hallucination_suspected",
        externalSubjectId: "customer-user-1",
        dedupeKey: `hallucination_suspected:${conversationId}`,
        detail: {
          conversationId,
          category: "hallucination_suspected",
          confidence: 0.8,
          evidenceMessageId: turn4.id,
          rationale: "Contradicts its own earlier stated policy",
        },
      })

      const regressionCase = await createRegressionCaseFromFlag(tx, {
        workspaceId: organization.id,
        flagId: flag!.id,
      })

      // createFlagIfNew's own return value predates recordSignalOccurrence linking signalId onto
      // the row — re-read it to see what createRegressionCaseFromFlag itself actually saw.
      const linkedFlag = await getFlagById(tx, organization.id, flag!.id)

      expect(regressionCase).toBeDefined()
      expect(regressionCase?.caseType).toBe("conversation")
      expect(regressionCase?.sourceSignalId).toBe(linkedFlag?.signalId)
      expect(regressionCase?.sourceSignalId).not.toBeNull()
      const input = regressionCase?.input as {
        turns: { role: string; content: string }[]
        finalPrompt: string
        externalSubjectId?: string
      }
      expect(input.finalPrompt).toBe("What about after 30 days?")
      expect(input.turns.map((t) => t.content)).toEqual([
        "What's your refund policy?",
        "We offer refunds within 30 days.",
      ])
      expect(input.externalSubjectId).toBe("customer-user-1")
      expect(regressionCase?.assertions).toEqual([
        {
          type: "llm_judge",
          config: {
            rubric:
              'Check whether the replayed conversation still exhibits "hallucination_suspected": Contradicts its own earlier stated policy',
          },
        },
      ])
    })
  })

  it("returns undefined for a flag with no behavioural detail, like retry_storm", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const flag = await createFlagIfNew(tx, {
        workspaceId: organization.id,
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${randomUUID()}`,
      })

      const result = await createRegressionCaseFromFlag(tx, {
        workspaceId: organization.id,
        flagId: flag!.id,
      })
      expect(result).toBeUndefined()
    })
  })

  it("returns undefined for a flag that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const result = await createRegressionCaseFromFlag(tx, {
        workspaceId: organization.id,
        flagId: randomUUID(),
      })
      expect(result).toBeUndefined()
    })
  })
})

describe("listRegressionCases / archiveRegressionCase", () => {
  it("excludes archived cases by default, and includes them when asked", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const kept = await createRegressionCase(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "n1",
        input: { nodeInput: {} },
      })
      const archived = await createRegressionCase(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "n1",
        input: { nodeInput: {} },
      })
      await archiveRegressionCase(tx, organization.id, archived.id)

      const active = await listRegressionCases(tx, organization.id, workflow.id)
      expect(active.map((c) => c.id)).toEqual([kept.id])

      const all = await listRegressionCases(tx, organization.id, workflow.id, {
        includeArchived: true,
      })
      expect(all.map((c) => c.id).sort()).toEqual([kept.id, archived.id].sort())

      expect(
        (await getRegressionCaseById(tx, organization.id, archived.id))
          ?.archivedAt
      ).not.toBeNull()
    })
  })

  it("does not return a case belonging to another workspace", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const regressionCase = await createRegressionCase(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "n1",
        input: { nodeInput: {} },
      })

      const { organization: otherOrg } = await createTestFixtures(tx)
      expect(
        await getRegressionCaseById(tx, otherOrg.id, regressionCase.id)
      ).toBeUndefined()
      expect(
        await getRegressionCaseById(tx, organization.id, regressionCase.id)
      ).toBeDefined()
    })
  })
})

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
  archiveEvalCase,
  createEvalCase,
  createEvalCaseFromFinding,
  createEvalCaseFromStep,
  getEvalCaseById,
  listEvalCases,
} from "./eval-case.repository.js"
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

describe("createEvalCaseFromStep", () => {
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
      const evalCase = await createEvalCaseFromStep(tx, {
        workspaceId: organization.id,
        stepId,
        sourceSignalId,
      })

      expect(evalCase).toBeDefined()
      expect(evalCase?.caseType).toBe("node")
      expect(evalCase?.nodeId).toBe("http-1")
      expect(evalCase?.input).toEqual({
        nodeInput: { url: "https://example.com" },
      })
      expect(evalCase?.sourceStepId).toBe(stepId)
      expect(evalCase?.sourceSignalId).toBe(sourceSignalId)
      expect(evalCase?.workflowId).toBe(workflow.id)

      // Not visible from another workspace, even with the right stepId.
      const { organization: otherOrg } = await createTestFixtures(tx)
      const fromOtherWorkspace = await createEvalCaseFromStep(tx, {
        workspaceId: otherOrg.id,
        stepId,
      })
      expect(fromOtherWorkspace).toBeUndefined()
    })
  })

  it("returns undefined for a step that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const result = await createEvalCaseFromStep(tx, {
        workspaceId: organization.id,
        stepId: randomUUID(),
      })
      expect(result).toBeUndefined()
    })
  })
})

describe("createEvalCaseFromFinding", () => {
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

      const evalCase = await createEvalCaseFromFinding(tx, {
        workspaceId: organization.id,
        findingId: finding.id,
      })

      expect(evalCase).toBeDefined()
      expect(evalCase?.caseType).toBe("conversation")
      expect(evalCase?.sourceFindingId).toBe(finding.id)
      const input = evalCase?.input as {
        turns: { role: string; content: string }[]
        finalPrompt: string
      }
      // Boundary is turn3 (the user message that produced the hallucinated reply) — history is
      // everything before it (turn1, turn2), not the hallucinated reply itself.
      expect(input.finalPrompt).toBe("What about after 30 days?")
      expect(input.turns.map((t) => t.content)).toEqual([
        "What's your refund policy?",
        "We offer refunds within 30 days.",
      ])
      expect(evalCase?.assertions).toEqual([
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
      const fromOtherWorkspace = await createEvalCaseFromFinding(tx, {
        workspaceId: otherOrg.id,
        findingId: finding.id,
      })
      expect(fromOtherWorkspace).toBeUndefined()
    })
  })

  it("returns undefined for a finding that doesn't exist", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const result = await createEvalCaseFromFinding(tx, {
        workspaceId: organization.id,
        findingId: randomUUID(),
      })
      expect(result).toBeUndefined()
    })
  })
})

describe("listEvalCases / archiveEvalCase", () => {
  it("excludes archived cases by default, and includes them when asked", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const kept = await createEvalCase(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "n1",
        input: { nodeInput: {} },
      })
      const archived = await createEvalCase(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "n1",
        input: { nodeInput: {} },
      })
      await archiveEvalCase(tx, organization.id, archived.id)

      const active = await listEvalCases(tx, organization.id, workflow.id)
      expect(active.map((c) => c.id)).toEqual([kept.id])

      const all = await listEvalCases(tx, organization.id, workflow.id, {
        includeArchived: true,
      })
      expect(all.map((c) => c.id).sort()).toEqual([kept.id, archived.id].sort())

      expect(
        (await getEvalCaseById(tx, archived.id))?.archivedAt
      ).not.toBeNull()
    })
  })
})

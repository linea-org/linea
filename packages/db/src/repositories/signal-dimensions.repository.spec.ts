import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { executions, executionSteps } from "../schema/index.js"
import { createFlagIfNew } from "./flag.repository.js"
import { getSignalDimensions } from "./signal-dimensions.repository.js"
import { listSignals } from "./signal.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function createAiStep(
  tx: Transaction,
  input: {
    workspaceId: string
    workflowId: string
    workflowVersionId: string
    environment: "production" | "dev" | "draft"
    model?: string
    provider?: string
  }
) {
  const [execution] = await tx
    .insert(executions)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      trigger: "manual",
      environment: input.environment,
    })
    .returning()
  if (!execution) throw new Error("Expected execution fixture")
  const now = new Date()
  const [step] = await tx
    .insert(executionSteps)
    .values({
      executionId: execution.id,
      workspaceId: input.workspaceId,
      traceId: randomUUID(),
      spanId: randomUUID(),
      name: "ai",
      startedAt: now,
      endedAt: now,
      status: "succeeded",
      nodeId: "agent",
      sequence: 1,
      input: {},
      output: { text: "response" },
      model: input.model,
      provider: input.provider,
    })
    .returning()
  return { execution, step }
}

describe("getSignalDimensions", () => {
  it("compares each model's signal rate with all other attributed runs", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const models = [
        ...Array.from({ length: 5 }, () => ["gpt-5", "openai"] as const),
        ...Array.from(
          { length: 5 },
          () => ["claude-sonnet-5", "anthropic"] as const
        ),
      ]
      const runs = []
      for (const [model, provider] of models) {
        runs.push(
          await createAiStep(tx, {
            workspaceId: organization.id,
            workflowId: workflow.id,
            workflowVersionId: version.id,
            environment: "production",
            model,
            provider,
          })
        )
      }
      for (const index of [0, 1, 5]) {
        const run = runs[index]
        if (!run) throw new Error("Expected fixture run")
        await createFlagIfNew(tx, {
          workspaceId: organization.id,
          executionId: run.execution.id,
          nodeId: "agent",
          flagType: "refusal",
          detail: { stepId: run.step.id },
          dedupeKey: `refusal:${run.step.id}`,
        })
      }
      const devRun = await createAiStep(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environment: "dev",
        model: "gpt-5",
        provider: "openai",
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: devRun.execution.id,
        nodeId: "agent",
        flagType: "refusal",
        detail: { stepId: devRun.step.id },
        dedupeKey: `refusal:${devRun.step.id}`,
      })
      const sourceRun = runs[0]
      if (!sourceRun) throw new Error("Expected source run")
      const now = new Date()
      const [replayStep] = await tx
        .insert(executionSteps)
        .values({
          executionId: sourceRun.execution.id,
          workspaceId: organization.id,
          traceId: randomUUID(),
          spanId: randomUUID(),
          name: "ai",
          startedAt: now,
          endedAt: now,
          status: "succeeded",
          nodeId: "agent",
          sequence: 2,
          input: {},
          output: { text: "response" },
          replayedFromStepId: sourceRun.step.id,
          model: "gpt-5",
          provider: "openai",
        })
        .returning()
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: sourceRun.execution.id,
        nodeId: "agent",
        flagType: "refusal",
        detail: { stepId: replayStep.id },
        dedupeKey: `refusal:${replayStep.id}`,
      })
      const [signal] = await listSignals(tx, organization.id)
      if (!signal) throw new Error("Expected signal")
      const result = await getSignalDimensions(tx, signal, "production")
      expect(result).toMatchObject({
        dimensionsApplicable: true,
        attributedRuns: 10,
        totalRuns: 10,
      })
      expect(result.dimensions).toEqual([
        expect.objectContaining({
          model: "gpt-5",
          occurrences: 2,
          totalRuns: 5,
          rate: 0.4,
          baselineRate: 0.2,
          lift: 2,
          sampleStatus: "sufficient",
        }),
        expect.objectContaining({
          model: "claude-sonnet-5",
          occurrences: 1,
          totalRuns: 5,
          rate: 0.2,
          baselineRate: 0.4,
          lift: 0.5,
          sampleStatus: "sufficient",
        }),
      ])
      await expect(getSignalDimensions(tx, signal, "dev")).resolves.toEqual({
        dimensionsApplicable: true,
        attributedRuns: 1,
        totalRuns: 1,
        dimensions: [
          expect.objectContaining({
            model: "gpt-5",
            occurrences: 1,
            totalRuns: 1,
            comparison: "only-model-observed",
            lift: null,
          }),
        ],
      })
    })
  })

  it("keeps unattributed history in coverage without inventing a model", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const run = await createAiStep(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environment: "production",
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: run.execution.id,
        nodeId: "agent",
        flagType: "empty_response",
        detail: { stepId: run.step.id },
        dedupeKey: `empty_response:${run.step.id}`,
      })
      const [signal] = await listSignals(tx, organization.id)
      if (!signal) throw new Error("Expected signal")
      await expect(
        getSignalDimensions(tx, signal, "production")
      ).resolves.toEqual({
        dimensionsApplicable: true,
        attributedRuns: 0,
        totalRuns: 1,
        dimensions: [],
      })
    })
  })

  it("does not offer model dimensions for an unrelated signal type", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const run = await createAiStep(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environment: "production",
        model: "gpt-5",
        provider: "openai",
      })
      await createFlagIfNew(tx, {
        workspaceId: organization.id,
        executionId: run.execution.id,
        nodeId: "agent",
        flagType: "retry_storm",
        dedupeKey: `retry_storm:${run.execution.id}`,
      })
      const [signal] = await listSignals(tx, organization.id)
      if (!signal) throw new Error("Expected signal")
      await expect(
        getSignalDimensions(tx, signal, "production")
      ).resolves.toEqual({
        dimensionsApplicable: false,
        attributedRuns: 0,
        totalRuns: 0,
        dimensions: [],
      })
    })
  })
})

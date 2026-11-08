import { randomUUID } from "node:crypto"
import { and, asc, desc, eq } from "drizzle-orm"
import {
  checkpoints,
  executions,
  executionSteps,
  type Checkpoint,
  type ExecutionStep,
  type NewCheckpoint,
  type NewExecutionStep,
} from "../schema/index.js"
import { getNextStepSequence } from "./execution-step.repository.js"
import type { DbClient } from "./types.js"

export type WriteStepAndCheckpointInput = {
  leasedBy: string
  step: Omit<NewExecutionStep, "id">
  checkpoint: Omit<NewCheckpoint, "id" | "executionId" | "createdAt">
}

/** Locks the execution row and checks `leasedBy` and lease expiry atomically before inserting, so a worker that lost or outlived its lease can't write; checkpoint.executionId is derived from step.executionId so the two can't diverge. */
export async function writeStepAndCheckpoint(
  db: DbClient,
  input: WriteStepAndCheckpointInput
): Promise<{ step: ExecutionStep; checkpoint: Checkpoint } | undefined> {
  return db.transaction(async (tx) => {
    const [execution] = await tx
      .select({
        leasedBy: executions.leasedBy,
        leaseExpiresAt: executions.leaseExpiresAt,
      })
      .from(executions)
      .where(eq(executions.id, input.step.executionId))
      .for("update")

    if (
      !execution ||
      execution.leasedBy !== input.leasedBy ||
      execution.leaseExpiresAt === null ||
      execution.leaseExpiresAt <= new Date()
    ) {
      return undefined
    }

    const sequence = await getNextStepSequence(tx, input.step.executionId)
    const [step] = await tx
      .insert(executionSteps)
      .values({ ...input.step, sequence })
      .returning()

    const [checkpoint] = await tx
      .insert(checkpoints)
      .values({
        ...input.checkpoint,
        sequence,
        executionId: input.step.executionId,
      })
      .returning()

    return { step, checkpoint }
  })
}

export async function getLatestCheckpoint(
  db: DbClient,
  executionId: string
): Promise<Checkpoint | undefined> {
  const [checkpoint] = await db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.executionId, executionId))
    .orderBy(desc(checkpoints.sequence))
    .limit(1)
  return checkpoint
}

export async function getStepsForExecution(
  db: DbClient,
  executionId: string
): Promise<ExecutionStep[]> {
  return db
    .select()
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId))
    .orderBy(asc(executionSteps.sequence))
}

/** Label for the synthetic resume-marker row, reserved from real node ids by validateGraphStructure in @linea/runtime — kept as a duplicated literal, not a cross-package import, so this package stays a lightweight dependency for workflow-JSON validation. Purely cosmetic: recordResumeEvent no longer uses this to identify prior resumes (see isSystemEvent), so a workflow-supplied node happening to share this id can't be misclassified. */
export const RESUME_EVENT_NODE_ID = "__resumed__"

/** Lease-fenced; shares the step counter with node steps. */
export async function recordResumeEvent(
  db: DbClient,
  executionId: string,
  workspaceId: string,
  leasedBy: string
): Promise<ExecutionStep | undefined> {
  return db.transaction(async (tx) => {
    const [execution] = await tx
      .select({
        leasedBy: executions.leasedBy,
        leaseExpiresAt: executions.leaseExpiresAt,
      })
      .from(executions)
      .where(eq(executions.id, executionId))
      .for("update")

    if (
      !execution ||
      execution.leasedBy !== leasedBy ||
      execution.leaseExpiresAt === null ||
      execution.leaseExpiresAt <= new Date()
    ) {
      return undefined
    }

    const priorResumes = await tx
      .select({ id: executionSteps.id })
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, executionId),
          eq(executionSteps.isSystemEvent, true)
        )
      )

    const now = new Date()
    const [step] = await tx
      .insert(executionSteps)
      .values({
        executionId,
        workspaceId,
        traceId: executionId,
        spanId: randomUUID(),
        name: "resumed",
        startedAt: now,
        endedAt: now,
        status: "succeeded",
        nodeId: RESUME_EVENT_NODE_ID,
        sequence: await getNextStepSequence(tx, executionId),
        attempt: priorResumes.length + 2,
        isSystemEvent: true,
      })
      .returning()
    return step
  })
}

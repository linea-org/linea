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

    const [step] = await tx
      .insert(executionSteps)
      .values(input.step)
      .returning()

    const [checkpoint] = await tx
      .insert(checkpoints)
      .values({ ...input.checkpoint, executionId: input.step.executionId })
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

/** Sentinel `nodeId`, safe from collision since real node ids come from user-authored workflow JSON, never this literal. */
export const RESUME_EVENT_NODE_ID = "__resumed__"

/** Marks a genuine resume (a worker picking up checkpointed state after a crash) as a timeline event, not a real node step — negative `sequence` keeps it out of the real step-count sequence a colliding insert could otherwise hit. */
export async function recordResumeEvent(
  db: DbClient,
  executionId: string,
  workspaceId: string
): Promise<ExecutionStep> {
  const priorResumes = await db
    .select({ id: executionSteps.id })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.executionId, executionId),
        eq(executionSteps.nodeId, RESUME_EVENT_NODE_ID)
      )
    )

  const now = new Date()
  const [step] = await db
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
      sequence: -(priorResumes.length + 1),
      attempt: priorResumes.length + 2,
    })
    .returning()
  return step
}

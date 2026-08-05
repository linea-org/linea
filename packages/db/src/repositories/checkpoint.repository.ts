import { asc, desc, eq } from "drizzle-orm"
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

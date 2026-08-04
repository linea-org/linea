import { asc, desc, eq } from "drizzle-orm"
import {
  checkpoints,
  executionSteps,
  type Checkpoint,
  type ExecutionStep,
  type NewCheckpoint,
  type NewExecutionStep,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type WriteStepAndCheckpointInput = {
  step: Omit<NewExecutionStep, "id">
  checkpoint: Omit<NewCheckpoint, "id" | "executionId" | "createdAt">
}

// The one write path for both tables — checkpoint.executionId is derived
// from step.executionId rather than passed separately, so the two can't
// end up pointing at different executions.
export async function writeStepAndCheckpoint(
  db: DbClient,
  input: WriteStepAndCheckpointInput
): Promise<{ step: ExecutionStep; checkpoint: Checkpoint }> {
  return db.transaction(async (tx) => {
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

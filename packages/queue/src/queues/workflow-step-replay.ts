import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_STEP_REPLAY_QUEUE = "workflow-step-replay"
const JOB_NAME = "replay"

export type WorkflowStepReplayJob = {
  replayStepId: string
  originalStepId: string
  overrideConfig: Record<string, unknown>
}

// execution-worker throws (rather than silently returning) when it finds a claim that's still
// "running" but not yet stale, so that delivery doesn't get marked complete and permanently
// stop BullMQ from ever rechecking it. These retries are what guarantee that eventual recheck:
// ATTEMPTS spaced BACKOFF_MS apart must span comfortably past @linea/db's
// execution-step.repository.ts REPLAY_CLAIM_STALE_MS (10 minutes) — by the last attempt, a
// claim whose original owner actually died has gone stale and can be reclaimed, while one
// still genuinely in flight just gets skipped again.
const REPLAY_RETRY_ATTEMPTS = 5
const REPLAY_RETRY_BACKOFF_MS = 3 * 60 * 1000

export function createWorkflowStepReplayQueue(
  connection: Redis
): Queue<WorkflowStepReplayJob> {
  return new Queue<WorkflowStepReplayJob>(WORKFLOW_STEP_REPLAY_QUEUE, {
    connection,
  })
}

export function enqueueWorkflowStepReplay(
  queue: Queue<WorkflowStepReplayJob>,
  job: WorkflowStepReplayJob
): Promise<Job<WorkflowStepReplayJob>> {
  return queue.add(JOB_NAME, job, {
    attempts: REPLAY_RETRY_ATTEMPTS,
    backoff: { type: "fixed", delay: REPLAY_RETRY_BACKOFF_MS },
  })
}

export function createWorkflowStepReplayWorker(
  connection: Redis,
  processor: Processor<WorkflowStepReplayJob>
): Worker<WorkflowStepReplayJob> {
  return new Worker<WorkflowStepReplayJob>(
    WORKFLOW_STEP_REPLAY_QUEUE,
    processor,
    { connection }
  )
}

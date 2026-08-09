import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_STEP_REPLAY_QUEUE = "workflow-step-replay"
const JOB_NAME = "replay"

export type WorkflowStepReplayJob = {
  replayStepId: string
  originalStepId: string
  overrideConfig: Record<string, unknown>
}

// execution-worker throws (not silently returns) on a claim that's "running" but not yet stale, so BullMQ keeps rechecking instead of marking it complete — ATTEMPTS spaced BACKOFF_MS apart must span comfortably past REPLAY_CLAIM_STALE_MS (10 min) so a truly-dead claim's owner eventually reclaims it.
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

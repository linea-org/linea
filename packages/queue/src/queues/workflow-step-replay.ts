import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_STEP_REPLAY_QUEUE = "workflow-step-replay"
const JOB_NAME = "replay"

export type WorkflowStepReplayJob = {
  replayStepId: string
  originalStepId: string
  overrideConfig: Record<string, unknown>
}

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
  return queue.add(JOB_NAME, job)
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

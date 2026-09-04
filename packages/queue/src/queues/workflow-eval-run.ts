import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_EVAL_RUN_QUEUE = "workflow-eval-run"
const JOB_NAME = "eval-run"

export type WorkflowEvalRunJob = {
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  trigger: "publish" | "manual"
}

const EVAL_RUN_RETRY_ATTEMPTS = 3
const EVAL_RUN_RETRY_BACKOFF_MS = 60_000

export function createWorkflowEvalRunQueue(
  connection: Redis
): Queue<WorkflowEvalRunJob> {
  return new Queue<WorkflowEvalRunJob>(WORKFLOW_EVAL_RUN_QUEUE, { connection })
}

// Never awaited by the publish request itself — this is the "warn, never block" boundary: a
// publish that succeeds always returns immediately, regardless of what eval results eventually
// come back.
export function enqueueWorkflowEvalRun(
  queue: Queue<WorkflowEvalRunJob>,
  job: WorkflowEvalRunJob
): Promise<Job<WorkflowEvalRunJob>> {
  return queue.add(JOB_NAME, job, {
    attempts: EVAL_RUN_RETRY_ATTEMPTS,
    backoff: { type: "fixed", delay: EVAL_RUN_RETRY_BACKOFF_MS },
  })
}

export function createWorkflowEvalRunWorker(
  connection: Redis,
  processor: Processor<WorkflowEvalRunJob>
): Worker<WorkflowEvalRunJob> {
  return new Worker<WorkflowEvalRunJob>(WORKFLOW_EVAL_RUN_QUEUE, processor, {
    connection,
  })
}

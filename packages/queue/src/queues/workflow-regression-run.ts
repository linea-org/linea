import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_REGRESSION_RUN_QUEUE = "workflow-regression-run"
const JOB_NAME = "regression-run"

export type WorkflowRegressionRunJob = {
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  trigger: "publish" | "manual"
}

const REGRESSION_RUN_RETRY_ATTEMPTS = 3
const REGRESSION_RUN_RETRY_BACKOFF_MS = 60_000

export function createWorkflowRegressionRunQueue(
  connection: Redis
): Queue<WorkflowRegressionRunJob> {
  return new Queue<WorkflowRegressionRunJob>(WORKFLOW_REGRESSION_RUN_QUEUE, {
    connection,
  })
}

// Publish never waits for regression results because quality warnings must not block deployment.
export function enqueueWorkflowRegressionRun(
  queue: Queue<WorkflowRegressionRunJob>,
  job: WorkflowRegressionRunJob
): Promise<Job<WorkflowRegressionRunJob>> {
  return queue.add(JOB_NAME, job, {
    attempts: REGRESSION_RUN_RETRY_ATTEMPTS,
    backoff: { type: "fixed", delay: REGRESSION_RUN_RETRY_BACKOFF_MS },
  })
}

export function createWorkflowRegressionRunWorker(
  connection: Redis,
  processor: Processor<WorkflowRegressionRunJob>
): Worker<WorkflowRegressionRunJob> {
  return new Worker<WorkflowRegressionRunJob>(
    WORKFLOW_REGRESSION_RUN_QUEUE,
    processor,
    {
      connection,
    }
  )
}

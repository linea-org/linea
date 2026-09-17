import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_EXECUTION_QUEUE = "workflow-execution"
const JOB_NAME = "execute"

// Retries after the run lease duration let a new worker reclaim an abandoned execution.
const EXECUTION_RETRY_ATTEMPTS = 3
const EXECUTION_RETRY_BACKOFF_MS = 45_000

export type WorkflowExecutionJob = {
  executionId: string
}

export function createWorkflowExecutionQueue(
  connection: Redis
): Queue<WorkflowExecutionJob> {
  return new Queue<WorkflowExecutionJob>(WORKFLOW_EXECUTION_QUEUE, {
    connection,
  })
}

export function enqueueWorkflowExecution(
  queue: Queue<WorkflowExecutionJob>,
  job: WorkflowExecutionJob,
  outboxMessageId: string
): Promise<Job<WorkflowExecutionJob>> {
  return queue.add(JOB_NAME, job, {
    jobId: outboxMessageId,
    attempts: EXECUTION_RETRY_ATTEMPTS,
    backoff: { type: "fixed", delay: EXECUTION_RETRY_BACKOFF_MS },
  })
}

export function createWorkflowExecutionWorker(
  connection: Redis,
  processor: Processor<WorkflowExecutionJob>
): Worker<WorkflowExecutionJob> {
  return new Worker<WorkflowExecutionJob>(WORKFLOW_EXECUTION_QUEUE, processor, {
    connection,
  })
}

import { Queue, Worker, type Job, type Processor } from "bullmq"
import type { Redis } from "ioredis"

export const WORKFLOW_EXECUTION_QUEUE = "workflow-execution"
const JOB_NAME = "execute"

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
  job: WorkflowExecutionJob
): Promise<Job<WorkflowExecutionJob>> {
  return queue.add(JOB_NAME, job)
}

export function createWorkflowExecutionWorker(
  connection: Redis,
  processor: Processor<WorkflowExecutionJob>
): Worker<WorkflowExecutionJob> {
  return new Worker<WorkflowExecutionJob>(WORKFLOW_EXECUTION_QUEUE, processor, {
    connection,
  })
}

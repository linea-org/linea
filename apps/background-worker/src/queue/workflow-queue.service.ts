import { Injectable, type OnModuleDestroy } from "@nestjs/common"
import {
  createConnection,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
  type WorkflowExecutionJob,
} from "@linea/queue"
import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

// Bounds createConnection()'s unbounded retries (required for BullMQ Worker use elsewhere) so a Redis outage rejects instead of hanging.
const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class WorkflowQueueService implements OnModuleDestroy {
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowExecutionJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowExecutionQueue(this.connection)
  }

  // On timeout the underlying command may still succeed after the caller marked it failed — accepted Phase 0 risk.
  async enqueue(executionId: string): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing execution after ${ENQUEUE_TIMEOUT_MS}ms`
            )
          ),
        ENQUEUE_TIMEOUT_MS
      )
    })

    try {
      await Promise.race([
        enqueueWorkflowExecution(this.queue, { executionId }),
        timeoutPromise,
      ])
    } finally {
      clearTimeout(timeout!)
    }
  }

  // queue.close() doesn't own a connection passed in from outside, so quit it separately.
  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}

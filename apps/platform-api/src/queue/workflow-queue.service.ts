import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import {
  createConnection,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
  type WorkflowExecutionJob,
} from '@linea/queue'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

// createConnection() sets maxRetriesPerRequest: null, which BullMQ requires for Worker
// connections but which lets an enqueue() call here retry indefinitely on a Redis outage,
// hanging the HTTP request forever instead of rejecting — bound it explicitly instead.
const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class WorkflowQueueService implements OnModuleDestroy {
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowExecutionJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowExecutionQueue(this.connection)
  }

  // Note: on timeout the underlying ioredis command may still be retrying in the
  // background and could eventually succeed after the caller has already marked the
  // execution failed — accepted Phase 0 risk, not solvable without closing the connection.
  async enqueue(executionId: string): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing execution after ${ENQUEUE_TIMEOUT_MS}ms`,
            ),
          ),
        ENQUEUE_TIMEOUT_MS,
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

  // queue.close() only stops the queue's own usage — it doesn't own a
  // connection passed in from outside, so the connection needs its own quit.
  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}

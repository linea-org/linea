import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import {
  closeQueueConnection,
  createConnection,
  createWorkflowStepReplayQueue,
  enqueueWorkflowStepReplay,
  type WorkflowStepReplayJob,
} from '@linea/queue'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

// Same rationale as WorkflowQueueService: createConnection() sets maxRetriesPerRequest: null, which would otherwise let an enqueue() call here retry indefinitely on a Redis outage, hanging the HTTP request forever instead of rejecting.
const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class StepReplayQueueService implements OnModuleDestroy {
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowStepReplayJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowStepReplayQueue(this.connection)
  }

  async enqueue(job: WorkflowStepReplayJob): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing step replay after ${ENQUEUE_TIMEOUT_MS}ms`,
            ),
          ),
        ENQUEUE_TIMEOUT_MS,
      )
    })

    try {
      await Promise.race([
        enqueueWorkflowStepReplay(this.queue, job),
        timeoutPromise,
      ])
    } finally {
      clearTimeout(timeout!)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closeQueueConnection(this.queue, this.connection)
  }
}

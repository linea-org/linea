import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import {
  closeQueueConnection,
  createConnection,
  createWorkflowRegressionRunQueue,
  enqueueWorkflowRegressionRun,
  type WorkflowRegressionRunJob,
} from '@linea/queue'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

// A Redis outage must not hold a publish request open indefinitely.
const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class RegressionRunQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(RegressionRunQueueService.name)
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowRegressionRunJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowRegressionRunQueue(this.connection)
  }

  /** Queue failures are logged but never allowed to fail workflow publication. */
  async enqueue(job: WorkflowRegressionRunJob): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing regression run after ${ENQUEUE_TIMEOUT_MS}ms`,
            ),
          ),
        ENQUEUE_TIMEOUT_MS,
      )
    })

    try {
      await Promise.race([
        enqueueWorkflowRegressionRun(this.queue, job),
        timeoutPromise,
      ])
    } catch (error) {
      // Logging preserves visibility without violating the non-blocking publish contract.
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Failed to enqueue regression run for workflow ${job.workflowId}: ${message}`,
      )
    } finally {
      clearTimeout(timeout!)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closeQueueConnection(this.queue, this.connection)
  }
}

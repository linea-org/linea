import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import {
  closeQueueConnection,
  createConnection,
  createWorkflowEvalRunQueue,
  enqueueWorkflowEvalRun,
  type WorkflowEvalRunJob,
} from '@linea/queue'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

// Same rationale as StepReplayQueueService: bounds how long a caller can be blocked by a Redis
// outage. Unlike that queue, a caller here never awaits the result either way — see enqueue's
// own doc comment.
const ENQUEUE_TIMEOUT_MS = 10_000

@Injectable()
export class EvalRunQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EvalRunQueueService.name)
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowEvalRunJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowEvalRunQueue(this.connection)
  }

  /** Fire-and-forget by design: publish must succeed regardless of whether eval results turn out
   * good, bad, or never arrive at all — this is the "warn, never block" boundary made concrete.
   * A caller that awaits this only learns whether the job was queued, never how the run went. */
  async enqueue(job: WorkflowEvalRunJob): Promise<void> {
    let timeout: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out enqueueing eval run after ${ENQUEUE_TIMEOUT_MS}ms`,
            ),
          ),
        ENQUEUE_TIMEOUT_MS,
      )
    })

    try {
      await Promise.race([
        enqueueWorkflowEvalRun(this.queue, job),
        timeoutPromise,
      ])
    } catch (error) {
      // Never rethrown — a caller enqueueing this on publish must not have publish itself fail
      // just because eval scheduling hiccuped. Logged so a persistent Redis problem is still
      // visible somewhere, not silently swallowed forever.
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `Failed to enqueue eval run for workflow ${job.workflowId}: ${message}`,
      )
    } finally {
      clearTimeout(timeout!)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closeQueueConnection(this.queue, this.connection)
  }
}

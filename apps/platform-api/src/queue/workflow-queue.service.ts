import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import {
  createConnection,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
  type WorkflowExecutionJob,
} from '@linea/queue'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

@Injectable()
export class WorkflowQueueService implements OnModuleDestroy {
  private readonly connection: Redis
  private readonly queue: Queue<WorkflowExecutionJob>

  constructor() {
    this.connection = createConnection()
    this.queue = createWorkflowExecutionQueue(this.connection)
  }

  async enqueue(executionId: string): Promise<void> {
    await enqueueWorkflowExecution(this.queue, { executionId })
  }

  // queue.close() only stops the queue's own usage — it doesn't own a
  // connection passed in from outside, so the connection needs its own quit.
  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}

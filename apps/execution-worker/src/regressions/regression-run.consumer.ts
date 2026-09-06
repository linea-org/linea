import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import type { Job, Worker } from "bullmq"
import {
  createConnection,
  createWorkflowRegressionRunWorker,
  type WorkflowRegressionRunJob,
} from "@linea/queue"
import { db, repositories, type RegressionRun } from "@linea/db"
import { RegressionExecutionService } from "./regression-execution.service"

@Injectable()
export class RegressionRunConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegressionRunConsumer.name)
  private worker?: Worker<WorkflowRegressionRunJob>

  constructor(private readonly regression: RegressionExecutionService) {}

  onModuleInit(): void {
    const connection = createConnection()
    this.worker = createWorkflowRegressionRunWorker(
      connection,
      async (job: Job<WorkflowRegressionRunJob>) => {
        const run = await this.regression.runRegressionForVersion(
          job.data.workspaceId,
          job.data.workflowId,
          job.data.workflowVersionId,
          job.data.trigger
        )
        // Publish-triggered failures need notification because no caller is watching their run.
        if (job.data.trigger === "publish" && run.failed > 0) {
          await this.notifyRegression(job.data.workflowId, run)
        }
      }
    )

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Regression run for workflow ${job?.data.workflowId} failed: ${error.message}`
      )
    })
  }

  private async notifyRegression(
    workflowId: string,
    run: RegressionRun
  ): Promise<void> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      run.workspaceId,
      workflowId
    )
    const memberUserIds = await repositories.organization.listMemberUserIds(
      db,
      run.workspaceId
    )
    await repositories.notification.createNotificationsForUsers(
      db,
      memberUserIds,
      {
        workspaceId: run.workspaceId,
        type: "system.warning",
        severity: "warning",
        title: `${workflow?.name ?? "A workflow"} failed ${run.failed} regression case${run.failed === 1 ? "" : "s"} on publish`,
        body: `${run.passed}/${run.total} regression cases passed for the version just published. The publish itself was not blocked.`,
        metadata: { workspaceId: run.workspaceId, workflowId },
      }
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.waitUntilReady().catch(() => {})
    await this.worker?.close()
  }
}

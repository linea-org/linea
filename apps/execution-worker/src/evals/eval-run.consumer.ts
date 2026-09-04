import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import type { Job, Worker } from "bullmq"
import {
  createConnection,
  createWorkflowEvalRunWorker,
  type WorkflowEvalRunJob,
} from "@linea/queue"
import { db, repositories, type EvalRun } from "@linea/db"
import { EvalExecutionService } from "./eval-execution.service"

@Injectable()
export class EvalRunConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvalRunConsumer.name)
  private worker?: Worker<WorkflowEvalRunJob>

  constructor(private readonly evals: EvalExecutionService) {}

  onModuleInit(): void {
    const connection = createConnection()
    this.worker = createWorkflowEvalRunWorker(
      connection,
      async (job: Job<WorkflowEvalRunJob>) => {
        const run = await this.evals.runEvalsForVersion(
          job.data.workspaceId,
          job.data.workflowId,
          job.data.workflowVersionId,
          job.data.trigger
        )
        // A manual re-run is already being watched by whoever triggered it from the UI — only a
        // publish-triggered run needs to actively surface a regression, since nobody's looking
        // at a results page for that one.
        if (job.data.trigger === "publish" && run.failed > 0) {
          await this.notifyRegression(job.data.workflowId, run)
        }
      }
    )

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Eval run for workflow ${job?.data.workflowId} failed: ${error.message}`
      )
    })
  }

  private async notifyRegression(
    workflowId: string,
    run: EvalRun
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
        title: `${workflow?.name ?? "A workflow"} failed ${run.failed} eval${run.failed === 1 ? "" : "s"} on publish`,
        body: `${run.passed}/${run.total} eval cases passed for the version just published. The publish itself was not blocked.`,
        metadata: { workspaceId: run.workspaceId, workflowId },
      }
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.waitUntilReady().catch(() => {})
    await this.worker?.close()
  }
}

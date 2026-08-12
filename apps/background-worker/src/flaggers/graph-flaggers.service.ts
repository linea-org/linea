import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { workflowGraphSchema } from "@linea/runtime"

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

@Injectable()
export class GraphFlaggersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphFlaggersService.name)
  private interval?: NodeJS.Timeout
  private sweeping = false

  onModuleInit(): void {
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      await this.flagRetryStorms()
      await this.flagExcessResumes()
      await this.flagCostJumps()
      await this.flagUnreachedBranches()
    } catch (error) {
      this.logger.error(
        `Graph flagger sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      this.sweeping = false
    }
  }

  private async flagRetryStorms(): Promise<void> {
    const results = await repositories.flag.detectRetryStorm(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        nodeId: r.nodeId,
        flagType: "retry_storm",
        detail: { maxAttempt: r.maxAttempt },
        dedupeKey: `retry_storm:${r.executionId}:${r.nodeId}`,
      })
    }
  }

  private async flagExcessResumes(): Promise<void> {
    const results = await repositories.flag.detectExcessResumes(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        flagType: "excess_resumes",
        detail: { resumeCount: r.resumeCount },
        dedupeKey: `excess_resumes:${r.executionId}`,
      })
    }
  }

  private async flagCostJumps(): Promise<void> {
    const results = await repositories.flag.detectCostJump(db)
    for (const r of results) {
      await repositories.flag.createFlagIfNew(db, {
        workspaceId: r.workspaceId,
        executionId: r.executionId,
        nodeId: r.nodeId,
        flagType: "cost_jump",
        detail: {
          costMicros: r.costMicros,
          historicalAvgMicros: r.historicalAvgMicros,
        },
        dedupeKey: `cost_jump:${r.executionId}:${r.nodeId}`,
      })
    }
  }

  private async flagUnreachedBranches(): Promise<void> {
    const workflows = await repositories.flag.getWorkflowIdsWithBranchSteps(db)
    for (const { workflowId, workspaceId } of workflows) {
      const version = await repositories.workflow.getPublishedVersion(
        db,
        workflowId
      )
      if (!version) continue
      const graph = workflowGraphSchema.parse(version.graph)

      for (const node of graph.nodes) {
        if (node.type !== "branch") continue
        const possibleConditions = graph.edges
          .filter((e) => e.from === node.id && e.condition !== undefined)
          .map((e) => e.condition as string)
        const observed = await repositories.flag.getObservedBranchValues(
          db,
          version.id,
          node.id
        )
        for (const condition of possibleConditions) {
          if (observed.has(condition)) continue
          await repositories.flag.createFlagIfNew(db, {
            workspaceId,
            workflowId,
            nodeId: node.id,
            flagType: "branch_never_taken",
            detail: { condition },
            dedupeKey: `branch_never_taken:${version.id}:${node.id}:${condition}`,
          })
        }
      }
    }
  }
}

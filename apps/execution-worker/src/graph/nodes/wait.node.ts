import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

const MS_PER_UNIT: Record<string, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

// A bad config is a real node failure, not a pause condition — thrown as a plain Error so it
// surfaces as the node failing, distinct from PauseExecutionError below.
function computeResumeAt(config: Record<string, unknown>): Date {
  if (config.mode === "until") {
    const raw = config.until
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error('Wait node (until) requires an "until" timestamp')
    }
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Wait node: could not parse "until" timestamp "${raw}"`)
    }
    return date
  }

  const amount = Number(config.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Wait node (duration) requires a positive "amount"')
  }
  const unit = typeof config.unit === "string" ? config.unit : "minutes"
  const unitMs = MS_PER_UNIT[unit]
  if (unitMs === undefined) {
    throw new Error(`Wait node: unknown unit "${unit}"`)
  }
  return new Date(Date.now() + amount * unitMs)
}

@Injectable()
export class WaitNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    _input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const { executionId, nodeId } = context
    if (!executionId || !nodeId) {
      throw new Error("Wait node requires executionId and nodeId in context")
    }

    let timer = await repositories.waitTimer.getWaitTimer(
      db,
      context.workspaceId,
      executionId,
      nodeId
    )

    if (!timer) {
      const resumeAt = computeResumeAt(config)
      const created = await repositories.waitTimer.createWaitTimer(db, {
        workspaceId: context.workspaceId,
        executionId,
        nodeId,
        resumeAt,
      })
      if (!created) {
        // A concurrent worker already inserted it — re-fetch rather than trust a possibly-undefined onConflictDoNothing result.
        timer = await repositories.waitTimer.getWaitTimer(
          db,
          context.workspaceId,
          executionId,
          nodeId
        )
      }
      throw new PauseExecutionError(nodeId)
    }

    if (!timer.fired) {
      throw new PauseExecutionError(nodeId)
    }

    return nodeRegistry.wait.outputSchema.parse({
      resumedAt: timer.firedAt!.toISOString(),
    })
  }
}

import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { compileContractSchema } from "@linea/protocol/json-schema"
import {
  agents,
  agentVersions,
  agentContractRevisions,
  environmentAgentBindings,
  executions,
  workflows,
} from "../schema/index.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"
import { pauseExecution, terminalStatuses } from "./execution.repository.js"
import type { DbClient } from "./types.js"

export type NestedAgentExecutionResult =
  | { outcome: "created"; execution: typeof executions.$inferSelect }
  | { outcome: "existing"; execution: typeof executions.$inferSelect }
  | {
      outcome:
        | "parent_not_found"
        | "agent_not_in_application"
        | "not_deployed"
        | "contract_changed"
        | "input_invalid"
      message: string
    }

/** Pins one Agent invocation of a Workflow Execution to its Environment's deployed version before the Agent runs; repeating the same node returns the original pinned row. */
export function startNestedAgentExecution(
  db: DbClient,
  input: {
    workspaceId: string
    parentExecutionId: string
    nodeId: string
    agentId: string
    agentContractRevisionId: string
    input: Record<string, unknown>
  }
): Promise<NestedAgentExecutionResult> {
  return db.transaction(async (tx): Promise<NestedAgentExecutionResult> => {
    const [parent] = await tx
      .select({ execution: executions, applicationId: workflows.applicationId })
      .from(executions)
      .innerJoin(workflows, eq(workflows.id, executions.workflowId))
      .where(
        and(
          eq(executions.id, input.parentExecutionId),
          eq(executions.workspaceId, input.workspaceId)
        )
      )
      .for("update", { of: executions })
    if (!parent?.execution.environmentId)
      return {
        outcome: "parent_not_found",
        message: "The Workflow Execution has no Environment",
      }
    const [existing] = await tx
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.parentExecutionId, input.parentExecutionId),
          eq(executions.parentNodeId, input.nodeId)
        )
      )
    if (existing) return { outcome: "existing", execution: existing }
    const [agent] = await tx
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, input.agentId),
          eq(agents.workspaceId, input.workspaceId)
        )
      )
    if (!agent || agent.applicationId !== parent.applicationId)
      return {
        outcome: "agent_not_in_application",
        message: "The Agent is not in this Workflow's Application",
      }
    const [deployment] = await tx
      .select({ version: agentVersions, contract: agentContractRevisions })
      .from(environmentAgentBindings)
      .innerJoin(
        agents,
        and(
          eq(agents.id, environmentAgentBindings.agentId),
          isNull(agents.archivedAt)
        )
      )
      .innerJoin(
        agentVersions,
        and(
          eq(agentVersions.id, environmentAgentBindings.agentVersionId),
          isNotNull(agentVersions.publishedAt)
        )
      )
      .innerJoin(
        agentContractRevisions,
        eq(
          agentContractRevisions.id,
          environmentAgentBindings.agentContractRevisionId
        )
      )
      .where(
        and(
          eq(environmentAgentBindings.workspaceId, input.workspaceId),
          eq(
            environmentAgentBindings.environmentId,
            parent.execution.environmentId
          ),
          eq(environmentAgentBindings.agentId, input.agentId),
          eq(environmentAgentBindings.enabled, true)
        )
      )
      .for("share")
    if (!deployment)
      return {
        outcome: "not_deployed",
        message:
          "The Agent is not deployed and enabled in this Execution's Environment",
      }
    if (deployment.contract.id !== input.agentContractRevisionId)
      return {
        outcome: "contract_changed",
        message:
          "The Agent's deployed Contract differs from the revision this Workflow was saved with",
      }
    if (!compileContractSchema(deployment.contract.inputSchema)(input.input))
      return {
        outcome: "input_invalid",
        message: "The step input does not satisfy the Agent's Contract",
      }
    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId: input.workspaceId,
        environmentId: parent.execution.environmentId,
        agentId: input.agentId,
        agentVersionId: deployment.version.id,
        agentContractRevisionId: deployment.contract.id,
        externalSubjectRecordId: parent.execution.externalSubjectRecordId,
        externalSubjectId: parent.execution.externalSubjectId,
        environment: parent.execution.environment,
        trigger: parent.execution.trigger,
        triggerPayload: input.input,
        parentExecutionId: input.parentExecutionId,
        parentNodeId: input.nodeId,
      })
      .returning()
    await createWorkflowExecutionMessage(tx, {
      workspaceId: input.workspaceId,
      executionId: execution.id,
    })
    return { outcome: "created", execution }
  })
}

export type ClaimNestedPauseResult =
  | { outcome: "paused" }
  | { outcome: "already-decided" }
  | { outcome: "lease-lost" }

/** Pauses the parent only while its nested Agent invocation is unfinished, so a child that finished first is read instead of waited for. */
export function claimPauseForNestedAgent(
  db: DbClient,
  workspaceId: string,
  parentExecutionId: string,
  nodeId: string,
  leasedBy: string
): Promise<ClaimNestedPauseResult> {
  return db.transaction(async (tx): Promise<ClaimNestedPauseResult> => {
    const [child] = await tx
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.workspaceId, workspaceId),
          eq(executions.parentExecutionId, parentExecutionId),
          eq(executions.parentNodeId, nodeId)
        )
      )
      .for("update")
    if (!child || terminalStatuses.includes(child.status))
      return { outcome: "already-decided" }
    const paused = await pauseExecution(tx, parentExecutionId, leasedBy)
    return paused ? { outcome: "paused" } : { outcome: "lease-lost" }
  })
}

export type NestedAgentInvocation = {
  nodeId: string
  executionId: string
  agentId: string
  agentVersionId: string
  status: (typeof executions.$inferSelect)["status"]
}

export async function listNestedAgentInvocations(
  db: DbClient,
  workspaceId: string,
  parentExecutionId: string
): Promise<NestedAgentInvocation[]> {
  const rows = await db
    .select()
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        eq(executions.parentExecutionId, parentExecutionId)
      )
    )
    .orderBy(executions.createdAt)
  return rows.flatMap((row) =>
    row.parentNodeId && row.agentId && row.agentVersionId
      ? [
          {
            nodeId: row.parentNodeId,
            executionId: row.id,
            agentId: row.agentId,
            agentVersionId: row.agentVersionId,
            status: row.status,
          },
        ]
      : []
  )
}

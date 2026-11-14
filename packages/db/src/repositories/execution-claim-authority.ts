import { and, eq } from "drizzle-orm"
import {
  agents,
  environmentAgentBindings,
  environments,
  environmentWorkflowBindings,
  externalSubjects,
  workflows,
  type Execution,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

function requireEnvironmentId(execution: Execution): string {
  if (!execution.environmentId)
    throw new Error("Deployed Execution has no Environment")
  return execution.environmentId
}

async function revokedWorkflowAuthority(
  tx: DbClient,
  execution: Execution,
  workflowId: string
): Promise<string | undefined> {
  const [workflow] = await tx
    .select({ archivedAt: workflows.archivedAt })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .for("share")
  if (!workflow || workflow.archivedAt) return "Workflow archived"
  // Only deployment starts pin a Contract revision; Development test runs never had a binding to lose.
  if (!execution.workflowContractRevisionId) return undefined
  const [binding] = await tx
    .select({ enabled: environmentWorkflowBindings.enabled })
    .from(environmentWorkflowBindings)
    .where(
      and(
        eq(
          environmentWorkflowBindings.environmentId,
          requireEnvironmentId(execution)
        ),
        eq(environmentWorkflowBindings.workflowId, workflowId)
      )
    )
    .for("share")
  if (!binding?.enabled) return "Workflow deployment disabled"
  return undefined
}

async function revokedAgentAuthority(
  tx: DbClient,
  execution: Execution,
  agentId: string
): Promise<string | undefined> {
  const [agent] = await tx
    .select({ archivedAt: agents.archivedAt })
    .from(agents)
    .where(eq(agents.id, agentId))
    .for("share")
  if (!agent || agent.archivedAt) return "Agent archived"
  const [binding] = await tx
    .select({ enabled: environmentAgentBindings.enabled })
    .from(environmentAgentBindings)
    .where(
      and(
        eq(
          environmentAgentBindings.environmentId,
          requireEnvironmentId(execution)
        ),
        eq(environmentAgentBindings.agentId, agentId)
      )
    )
    .for("share")
  if (!binding?.enabled) return "Agent deployment disabled"
  return undefined
}

/** Share-locks authority rows in the subject-then-Environment order Action Intent claims use, so a revocation either commits first and is seen here or waits for this claim to commit. */
export async function revokedExecutionAuthority(
  tx: DbClient,
  execution: Execution
): Promise<string | undefined> {
  if (execution.externalSubjectRecordId) {
    const [subject] = await tx
      .select({ status: externalSubjects.status })
      .from(externalSubjects)
      .where(eq(externalSubjects.id, execution.externalSubjectRecordId))
      .for("share")
    if (
      !subject ||
      subject.status === "disabled" ||
      subject.status === "erased"
    )
      return "External Subject disabled or erased"
  }
  if (execution.environmentId) {
    const [environment] = await tx
      .select({ enabled: environments.enabled })
      .from(environments)
      .where(eq(environments.id, execution.environmentId))
      .for("share")
    if (!environment?.enabled) return "Environment disabled"
  }
  if (execution.workflowId)
    return revokedWorkflowAuthority(tx, execution, execution.workflowId)
  if (execution.agentId)
    return revokedAgentAuthority(tx, execution, execution.agentId)
  return undefined
}

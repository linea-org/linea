import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import {
  environments,
  environmentAgentBindings,
  agentContractRevisions,
  agents,
  agentVersions,
  type EnvironmentAgentBinding,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type PutEnvironmentAgentBindingInput = {
  agentVersionId: string
  agentContractRevisionId: string
  enabled: boolean
}

export type PutEnvironmentAgentBindingResult =
  | { outcome: "updated"; binding: EnvironmentAgentBinding }
  | { outcome: "environment_not_found" }
  | { outcome: "agent_not_found" }
  | { outcome: "contract_revision_not_found" }
  | { outcome: "version_not_found" }

export async function putEnvironmentAgentBinding(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  agentId: string,
  input: PutEnvironmentAgentBindingInput
): Promise<PutEnvironmentAgentBindingResult> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select({
        id: environments.id,
        applicationId: environments.applicationId,
      })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId)
        )
      )
      .for("update")
    if (!environment) return { outcome: "environment_not_found" }
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.id, agentId),
          eq(agents.applicationId, environment.applicationId),
          isNull(agents.archivedAt)
        )
      )
    if (!agent) return { outcome: "agent_not_found" }
    const [revision] = await tx
      .select({ id: agentContractRevisions.id })
      .from(agentContractRevisions)
      .where(
        and(
          eq(agentContractRevisions.workspaceId, workspaceId),
          eq(agentContractRevisions.agentId, agentId),
          eq(agentContractRevisions.id, input.agentContractRevisionId)
        )
      )
    if (!revision) return { outcome: "contract_revision_not_found" }
    const [version] = await tx
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, input.agentVersionId),
          eq(agentVersions.agentId, agentId),
          eq(
            agentVersions.agentContractRevisionId,
            input.agentContractRevisionId
          ),
          isNotNull(agentVersions.publishedAt)
        )
      )
      .for("share")
    if (!version) return { outcome: "version_not_found" }
    const [binding] = await tx
      .insert(environmentAgentBindings)
      .values({
        workspaceId,
        environmentId,
        applicationId: environment.applicationId,
        agentId,
        ...input,
      })
      .onConflictDoUpdate({
        target: [
          environmentAgentBindings.environmentId,
          environmentAgentBindings.agentId,
        ],
        set: { ...input, updatedAt: new Date() },
      })
      .returning()
    return { outcome: "updated", binding }
  })
}

export async function listEnvironmentAgentBindings(
  db: DbClient,
  workspaceId: string,
  environmentId: string
): Promise<EnvironmentAgentBinding[]> {
  return db
    .select()
    .from(environmentAgentBindings)
    .where(
      and(
        eq(environmentAgentBindings.workspaceId, workspaceId),
        eq(environmentAgentBindings.environmentId, environmentId)
      )
    )
    .orderBy(desc(environmentAgentBindings.createdAt))
}

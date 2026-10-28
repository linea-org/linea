import { and, desc, eq, max } from "drizzle-orm"
import {
  agentContractRevisions,
  agents,
  type AgentContractRevision,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type CreateAgentContractRevisionInput = {
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export type CreateAgentContractRevisionResult =
  | { outcome: "created"; revision: AgentContractRevision }
  | { outcome: "not_found" }

export async function createAgentContractRevision(
  db: DbClient,
  workspaceId: string,
  agentId: string,
  input: CreateAgentContractRevisionInput
): Promise<CreateAgentContractRevisionResult> {
  return db.transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
      .for("update")
    if (!agent) return { outcome: "not_found" }
    const [{ latest }] = await tx
      .select({ latest: max(agentContractRevisions.revision) })
      .from(agentContractRevisions)
      .where(eq(agentContractRevisions.agentId, agentId))
    const [revision] = await tx
      .insert(agentContractRevisions)
      .values({
        workspaceId,
        agentId,
        revision: (latest ?? 0) + 1,
        ...input,
      })
      .returning()
    return { outcome: "created", revision }
  })
}

export async function getAgentContractRevision(
  db: DbClient,
  workspaceId: string,
  agentId: string,
  id: string
): Promise<AgentContractRevision | undefined> {
  const [revision] = await db
    .select()
    .from(agentContractRevisions)
    .where(
      and(
        eq(agentContractRevisions.workspaceId, workspaceId),
        eq(agentContractRevisions.agentId, agentId),
        eq(agentContractRevisions.id, id)
      )
    )
  return revision
}

export async function listAgentContractRevisions(
  db: DbClient,
  workspaceId: string,
  agentId: string
): Promise<AgentContractRevision[]> {
  return db
    .select()
    .from(agentContractRevisions)
    .where(
      and(
        eq(agentContractRevisions.workspaceId, workspaceId),
        eq(agentContractRevisions.agentId, agentId)
      )
    )
    .orderBy(desc(agentContractRevisions.revision))
}

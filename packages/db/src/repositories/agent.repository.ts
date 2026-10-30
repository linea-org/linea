import { and, desc, eq, max, sql } from "drizzle-orm"
import {
  agents,
  agentVersions,
  agentContractRevisions,
  type Agent,
  type NewAgent,
  type AgentVersion,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createAgent(
  db: DbClient,
  input: NewAgent
): Promise<Agent | undefined> {
  const [agent] = await db
    .insert(agents)
    .values(input)
    .onConflictDoNothing({ target: [agents.applicationId, agents.slug] })
    .returning()
  return agent
}

export async function getAgentById(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<Agent | undefined> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, id)))
  return agent
}

export async function listAgents(
  db: DbClient,
  workspaceId: string,
  applicationId: string
): Promise<Agent[]> {
  return await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.applicationId, applicationId)
      )
    )
    .orderBy(desc(agents.createdAt))
}

export async function updateAgent(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: {
    name?: string
    description?: string | null
    archivedAt?: Date | null
  }
): Promise<Agent | undefined> {
  const [agent] = await db
    .update(agents)
    .set(input)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, id)))
    .returning()
  return agent
}

export type CreateAgentVersionInput = {
  definition: Record<string, unknown>
  agentContractRevisionId: string
}

export type CreateAgentVersionResult =
  | { outcome: "created"; version: AgentVersion }
  | { outcome: "agent_not_found" }
  | { outcome: "contract_revision_not_found" }

export async function createAgentVersion(
  db: DbClient,
  workspaceId: string,
  agentId: string,
  input: CreateAgentVersionInput
): Promise<CreateAgentVersionResult> {
  return await db.transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
      .for("update")
    if (!agent) return { outcome: "agent_not_found" }
    const [contract] = await tx
      .select({ id: agentContractRevisions.id })
      .from(agentContractRevisions)
      .where(
        and(
          eq(agentContractRevisions.workspaceId, workspaceId),
          eq(agentContractRevisions.agentId, agentId),
          eq(agentContractRevisions.id, input.agentContractRevisionId)
        )
      )
    if (!contract) return { outcome: "contract_revision_not_found" }
    const [{ latest }] = await tx
      .select({ latest: max(agentVersions.version) })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
    const [version] = await tx
      .insert(agentVersions)
      .values({ agentId, ...input, version: (latest ?? 0) + 1 })
      .returning()
    return { outcome: "created", version }
  })
}

export async function listAgentVersions(
  db: DbClient,
  workspaceId: string,
  agentId: string
): Promise<AgentVersion[]> {
  return await db
    .select({ version: agentVersions })
    .from(agentVersions)
    .innerJoin(agents, eq(agents.id, agentVersions.agentId))
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .orderBy(desc(agentVersions.version))
    .then((rows) => rows.map((row) => row.version))
}

export async function getAgentVersionById(
  db: DbClient,
  workspaceId: string,
  agentId: string,
  versionId: string
): Promise<AgentVersion | undefined> {
  const [row] = await db
    .select({ version: agentVersions })
    .from(agentVersions)
    .innerJoin(agents, eq(agents.id, agentVersions.agentId))
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.id, agentId),
        eq(agentVersions.id, versionId)
      )
    )
  return row?.version
}

export async function publishAgentVersion(
  db: DbClient,
  workspaceId: string,
  agentId: string,
  versionId: string
): Promise<AgentVersion | undefined> {
  const [version] = await db
    .update(agentVersions)
    .set({ publishedAt: sql`coalesce(${agentVersions.publishedAt}, now())` })
    .where(
      and(
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.id, versionId),
        sql`exists (select 1 from ${agents} where ${agents.id} = ${agentId} and ${agents.workspaceId} = ${workspaceId} and ${agents.archivedAt} is null)`
      )
    )
    .returning()
  return version
}

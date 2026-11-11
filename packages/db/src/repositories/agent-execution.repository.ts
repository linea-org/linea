import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { compileContractSchema } from "@linea/protocol/json-schema"
import {
  agents,
  agentVersions,
  agentContractRevisions,
  environmentAgentBindings,
  executions,
} from "../schema/index.js"
import {
  resolveSubject,
  getPublicExecution,
  type StartPublicExecutionResult,
} from "./public-runtime.repository.js"
import {
  reservePublicRequest,
  releasePublicRequest,
  finalizePublicRequest,
} from "./public-idempotency.repository.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"
import type { DbClient } from "./types.js"

export function startAgentExecution(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    externalSubjectId: string
    agentId: string
    triggerPayload: Record<string, unknown>
    idempotency: {
      actor: { kind: "environment_key"; id: string }
      key: string
      requestHash: string
    }
  }
): Promise<StartPublicExecutionResult> {
  return db.transaction(async (tx): Promise<StartPublicExecutionResult> => {
    const reservation = await reservePublicRequest(tx, {
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      actorKind: input.idempotency.actor.kind,
      actorId: input.idempotency.actor.id,
      operation: "execution.start",
      idempotencyKey: input.idempotency.key,
      requestHash: input.idempotency.requestHash,
    })
    if (reservation.outcome === "conflict")
      return { outcome: "idempotency_conflict" }
    if (reservation.outcome === "replay") {
      const execution = await getPublicExecution(
        tx,
        input.workspaceId,
        input.environmentId,
        input.externalSubjectId,
        reservation.resourceId
      )
      if (!execution) throw new Error("Idempotent Execution disappeared")
      return { outcome: "replay", execution }
    }
    const identity = await resolveSubject(
      tx,
      input.workspaceId,
      input.environmentId,
      input.externalSubjectId
    )
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
          eq(environmentAgentBindings.environmentId, input.environmentId),
          eq(environmentAgentBindings.agentId, input.agentId),
          eq(environmentAgentBindings.enabled, true)
        )
      )
      .for("share")
    if (!identity || !deployment) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "resource_not_found" }
    }
    if (
      !compileContractSchema(deployment.contract.inputSchema)(
        input.triggerPayload
      )
    ) {
      await releasePublicRequest(tx, reservation.recordId)
      return { outcome: "validation_failed" }
    }
    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        agentId: input.agentId,
        agentVersionId: deployment.version.id,
        agentContractRevisionId: deployment.contract.id,
        externalSubjectRecordId: input.externalSubjectId,
        externalSubjectId: identity.issuerSubject,
        environment: identity.environment,
        trigger: "api",
        triggerPayload: input.triggerPayload,
      })
      .returning()
    await createWorkflowExecutionMessage(tx, {
      workspaceId: input.workspaceId,
      executionId: execution.id,
    })
    await finalizePublicRequest(tx, reservation.recordId, execution.id)
    return { outcome: "created", execution }
  })
}

import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  environments,
  environmentWorkflowBindings,
  executions,
  outboxMessages,
  users,
  members,
} from "../schema/index.js"
import {
  createTestFixtures,
  publishTestWorkflow,
  withRollback,
} from "./test-utils.js"
import { createWorkflowContractRevision } from "./workflow-contract.repository.js"
import { createWorkflowVersion } from "./workflow.repository.js"
import { triggerWorkflowExecution } from "./execution.repository.js"

describe("management Workflow start policy", () => {
  it("checks flags, immutable input contract and live Production role before any execution or outbox write", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const contract = await createWorkflowContractRevision(
        tx,
        organization.id,
        workflow.id,
        {
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
            additionalProperties: false,
          },
          outputSchema: { type: "object" },
        }
      )
      if (contract.outcome !== "created") throw new Error("Contract missing")
      const version = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        workflowContractRevisionId: contract.revision.id,
        graph: { nodes: [], edges: [] },
        contentHash: "strict",
      })
      await publishTestWorkflow(tx, workflow.id, version.id)
      const [admin, member] = await tx
        .insert(users)
        .values(
          ["Admin", "Member"].map((name) => ({
            name,
            email: `${randomUUID()}@test.dev`,
          }))
        )
        .returning()
      await tx.insert(members).values([
        {
          organizationId: organization.id,
          userId: admin.id,
          role: "admin",
          createdAt: new Date(),
        },
        {
          organizationId: organization.id,
          userId: member.id,
          role: "member",
          createdAt: new Date(),
        },
      ])
      const targets = await tx
        .select()
        .from(environments)
        .where(eq(environments.applicationId, workflow.applicationId))
      for (const environment of targets) {
        const lookup = {
          by: "slug",
          value: workflow.slug,
          applicationId: workflow.applicationId,
        } as const
        const input = {
          trigger: "webhook",
          environmentId: environment.id,
          triggeredByUserId: admin.id,
          triggerPayload: { message: "hello" },
        } as const
        const bindingWhere = and(
          eq(environmentWorkflowBindings.environmentId, environment.id),
          eq(environmentWorkflowBindings.workflowId, workflow.id)
        )
        await tx
          .update(environmentWorkflowBindings)
          .set({ allowBackendStart: false, allowEndUserStart: true })
          .where(bindingWhere)
        expect(
          await triggerWorkflowExecution(tx, organization.id, lookup, input)
        ).toEqual({ outcome: "workflow_start_not_allowed" })
        await tx
          .update(environmentWorkflowBindings)
          .set({ allowBackendStart: true, allowEndUserStart: false })
          .where(bindingWhere)
        for (const triggerPayload of [
          undefined,
          {},
          { message: 42 },
          { message: "ok", extra: true },
        ]) {
          const result = await triggerWorkflowExecution(
            tx,
            organization.id,
            lookup,
            { ...input, triggerPayload }
          )
          expect(result.outcome).toBe("validation_failed")
          if (result.outcome === "validation_failed")
            expect(result.message).toContain("Workflow Contract")
        }
        await tx
          .update(environmentWorkflowBindings)
          .set({ enabled: false })
          .where(bindingWhere)
        expect(
          await triggerWorkflowExecution(tx, organization.id, lookup, input)
        ).toEqual({ outcome: "unpublished" })
        await tx
          .update(environmentWorkflowBindings)
          .set({ enabled: true })
          .where(bindingWhere)
        if (environment.environment === "production") {
          for (const triggeredByUserId of [undefined, member.id]) {
            expect(
              await triggerWorkflowExecution(tx, organization.id, lookup, {
                ...input,
                triggeredByUserId,
              })
            ).toEqual({ outcome: "production_start_forbidden" })
          }
        }
      }
      expect(
        await tx
          .select()
          .from(executions)
          .where(eq(executions.workspaceId, organization.id))
      ).toHaveLength(0)
      expect(
        await tx
          .select()
          .from(outboxMessages)
          .where(eq(outboxMessages.workspaceId, organization.id))
      ).toHaveLength(0)
      for (const environment of targets) {
        const result = await triggerWorkflowExecution(
          tx,
          organization.id,
          { by: "id", value: workflow.id },
          {
            trigger: "manual",
            environmentId: environment.id,
            triggeredByUserId:
              environment.environment === "production" ? admin.id : member.id,
            triggerPayload: { message: "ok" },
          }
        )
        expect(result).toMatchObject({
          outcome: "created",
          execution: {
            workflowVersionId: version.id,
            workflowContractRevisionId: contract.revision.id,
            externalSubjectRecordId: null,
          },
        })
      }
      expect(
        await tx
          .select()
          .from(outboxMessages)
          .where(eq(outboxMessages.workspaceId, organization.id))
      ).toHaveLength(2)
    })
  })
})

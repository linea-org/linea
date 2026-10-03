import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"
import {
  environments,
  externalSubjects,
  externalSubjectEnvironments,
} from "../schema/index.js"
import {
  createActionIntent,
  claimApprovedActionIntent,
  beginActionIntentDispatch,
} from "./action-intent.repository.js"
import {
  decideExternalApprovalRequest,
  findExternalApprovalRequests,
} from "./approval-request.repository.js"
import { endUserSessions } from "../schema/index.js"
import { createExecution, startExecution } from "./execution.repository.js"
import { getConnectorReadAuthority } from "./connection.repository.js"
import { connections } from "../schema/index.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { getWorkflowEnvironment } from "./environment.repository.js"

describe("shared Environment Connections", () => {
  it("owns a GitHub installation without inventing an External Subject", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const environment = await getWorkflowEnvironment(
        tx,
        organization.id,
        workflow.id,
        "dev"
      )
      if (!environment) throw new Error("Fixture Environment missing")
      const [connection] = await tx
        .insert(connections)
        .values({
          id: randomUUID(),
          workspaceId: organization.id,
          environmentId: environment.id,
          externalSubjectId: null,
          ownership: "environment",
          authorizationKind: "github_app_installation",
          provider: "github",
          providerAccountId: "installation:42",
          accountLabel: "Acme GitHub installation",
          status: "active",
          scopes: ["repo"],
          credentialEncrypted: "encrypted-test-credential",
        })
        .returning()
      expect(connection.externalSubjectId).toBeNull()
      expect(connection.ownership).toBe("environment")
      expect(connection.authorizationKind).toBe("github_app_installation")
    })
  })
  it("denies shared use until an explicit requester grant exists, then blocks revoked access", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const environment = await getWorkflowEnvironment(
        tx,
        organization.id,
        workflow.id,
        "dev"
      )
      if (!environment) throw new Error("Fixture Environment missing")
      await tx
        .update(environments)
        .set({
          connectorAccessPolicy: {
            providers: [
              {
                provider: "github",
                actionFamilies: ["issues"],
                maxScopes: ["repo"],
              },
            ],
          },
        })
        .where(eq(environments.id, environment.id))
      const [subject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: randomUUID(),
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await tx.insert(externalSubjectEnvironments).values({
        workspaceId: organization.id,
        environmentId: environment.id,
        externalSubjectId: subject.id,
      })
      const [connection] = await tx
        .insert(connections)
        .values({
          workspaceId: organization.id,
          environmentId: environment.id,
          externalSubjectId: null,
          ownership: "environment",
          authorizationKind: "github_app_installation",
          provider: "github",
          providerAccountId: "installation:42",
          accountLabel: "Acme",
          status: "active",
          scopes: ["repo"],
          credentialEncrypted: "encrypted-test-credential",
        })
        .returning()
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environmentId: environment.id,
        externalSubjectRecordId: subject.id,
        trigger: "manual",
      })
      const input = {
        workspaceId: organization.id,
        executionId: execution.id,
        connectionId: connection.id,
      }
      expect(await getConnectorReadAuthority(tx, input)).toBeUndefined()
      await tx.execute(
        sql`INSERT INTO connection_access_grants (workspace_id, environment_id, connection_id, external_subject_id) VALUES (${organization.id}, ${environment.id}, ${connection.id}, ${subject.id})`
      )
      expect((await getConnectorReadAuthority(tx, input))?.connection.id).toBe(
        connection.id
      )
      await tx.execute(
        sql`UPDATE connection_access_grants SET revoked_at = now() WHERE connection_id = ${connection.id}`
      )
      expect(await getConnectorReadAuthority(tx, input)).toBeUndefined()
    })
  })
  it.each(["before_claim", "after_claim"])(
    "requires an assigned human reviewer and rejects revoked consent %s",
    async (phase) => {
      await withRollback(async (tx) => {
        const { organization, workflow, version } = await createTestFixtures(tx)
        const environment = await getWorkflowEnvironment(
          tx,
          organization.id,
          workflow.id,
          "dev"
        )
        if (!environment) throw new Error("Fixture Environment missing")
        await tx
          .update(environments)
          .set({
            connectorAccessPolicy: {
              providers: [
                {
                  provider: "github",
                  actionFamilies: ["issues"],
                  maxScopes: ["repo"],
                },
              ],
            },
          })
          .where(eq(environments.id, environment.id))
        const subjects = await tx
          .insert(externalSubjects)
          .values(
            ["requester", "reviewer"].map<typeof externalSubjects.$inferInsert>(
              (name) => ({
                workspaceId: organization.id,
                issuer: "https://identity.example.com",
                issuerSubject: name + randomUUID(),
                status: "verified",
                verifiedAt: new Date(),
              })
            )
          )
          .returning()
        const [requester, reviewer] = subjects
        await tx.insert(externalSubjectEnvironments).values(
          subjects.map((subject) => ({
            workspaceId: organization.id,
            environmentId: environment.id,
            externalSubjectId: subject.id,
          }))
        )
        const sessions = await tx
          .insert(endUserSessions)
          .values(
            subjects.map((subject) => ({
              workspaceId: organization.id,
              environmentId: environment.id,
              externalSubjectId: subject.id,
              tokenHash: randomUUID(),
              proofJkt: randomUUID(),
              nonceHash: randomUUID(),
              expiresAt: new Date(Date.now() + 300000),
            }))
          )
          .returning()
        const [connection] = await tx
          .insert(connections)
          .values({
            workspaceId: organization.id,
            environmentId: environment.id,
            externalSubjectId: null,
            ownership: "environment",
            authorizationKind: "github_app_installation",
            provider: "github",
            providerAccountId: "installation:42",
            accountLabel: "Acme",
            status: "active",
            scopes: ["repo"],
            credentialEncrypted: "encrypted-test-credential",
          })
          .returning()
        await tx.execute(
          sql`INSERT INTO connection_access_grants (workspace_id, environment_id, connection_id, external_subject_id) VALUES (${organization.id}, ${environment.id}, ${connection.id}, ${requester.id})`
        )
        const execution = await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          environmentId: environment.id,
          externalSubjectRecordId: requester.id,
          trigger: "manual",
        })
        const claimId = randomUUID()
        await startExecution(
          tx,
          execution.id,
          claimId,
          new Date(Date.now() + 300000)
        )
        const envelope = {
          version: 1,
          operationRevision: "1",
          connectionId: connection.id,
          connector: "github",
          operation: "github.issues.create",
          target: { owner: "acme", repository: "support" },
          parameters: { title: "Investigate" },
          providerPreconditions: {},
        }
        const created = await createActionIntent(tx, {
          workspaceId: organization.id,
          executionId: execution.id,
          nodeId: "write",
          connectionId: connection.id,
          connector: "github",
          actionFamily: "issues",
          requiredScopes: ["repo"],
          operationId: "github.issues.create",
          operationRevision: "1",
          target: envelope.target,
          normalizedParameters: envelope.parameters,
          providerPreconditions: envelope.providerPreconditions,
          safeDisplay: { title: "Create an issue" },
          digestVersion: "jcs-sha256-v1",
          canonicalDigest: "a".repeat(43),
          canonicalEnvelope: { ...envelope, version: 1 },
          invocationIdempotencyKey: randomUUID(),
          expiresAt: new Date(Date.now() + 300000),
        })
        expect(created.outcome).toBe("created")
        if (created.outcome !== "created")
          throw new Error("Intent creation rejected")
        const decisionInput = {
          workspaceId: organization.id,
          environmentId: environment.id,
          externalSubjectId: requester.id,
          endUserSessionId: sessions[0].id,
          approvalRequestId: created.approvalRequest.id,
          outcome: "approved",
          idempotencyKey: randomUUID(),
          now: new Date(),
        }
        expect(
          (
            await decideExternalApprovalRequest(tx, {
              ...decisionInput,
              outcome: "approved",
            })
          ).outcome
        ).toBe("wrong_subject")
        await tx.execute(
          sql`INSERT INTO connection_reviewer_assignments (workspace_id, environment_id, connection_id, external_subject_id) VALUES (${organization.id}, ${environment.id}, ${connection.id}, ${reviewer.id})`
        )
        expect(
          await findExternalApprovalRequests(tx, {
            workspaceId: organization.id,
            environmentId: environment.id,
            externalSubjectId: reviewer.id,
            status: "pending",
            limit: 10,
          })
        ).toHaveLength(1)
        expect(
          (
            await decideExternalApprovalRequest(tx, {
              ...decisionInput,
              externalSubjectId: reviewer.id,
              endUserSessionId: sessions[1].id,
              outcome: "approved",
            })
          ).outcome
        ).toBe("decided")
        const claimInput = {
          actionIntentId: created.intent.id,
          executionClaimId: claimId,
          provider: "github",
          actionFamily: "issues",
          requiredScopes: ["repo"],
          now: new Date(),
        }
        if (phase === "after_claim")
          expect(
            (await claimApprovedActionIntent(tx, claimInput))?.outcome
          ).toBe("claimed")
        await tx.execute(
          sql`UPDATE connection_reviewer_assignments SET revoked_at = now() WHERE connection_id = ${connection.id}`
        )
        if (phase === "after_claim")
          expect(
            await beginActionIntentDispatch(tx, claimInput)
          ).toBeUndefined()
        else
          expect(
            (await claimApprovedActionIntent(tx, claimInput))?.outcome
          ).toBe("cancelled")
      })
    }
  )
})

import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  applicationKeys,
  applications,
  auditLogs,
  externalSubjectApplications,
  externalSubjects,
  users,
} from "../schema/index.js"
import {
  disableExternalSubject,
  eraseExternalSubject,
  findExternalSubjectByIdentity,
  getApplicationExternalSubject,
  provisionExternalSubject,
} from "./external-subject.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

async function createApplication(
  tx: DbClient,
  workspaceId: string,
  issuer: string,
  name: string
) {
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId,
      environment: "production",
      displayName: name,
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: issuer,
      oidcClientId: name,
      oidcAudience: "linea",
      oidcJwksUrl: `${issuer}/jwks.json`,
    })
    .returning()
  return application
}

async function createApplicationKey(
  tx: DbClient,
  workspaceId: string,
  applicationId: string,
  suffix: string
) {
  const [key] = await tx
    .insert(applicationKeys)
    .values({
      workspaceId,
      applicationId,
      name: "Subject provisioner",
      scopes: ["subjects:provision"],
      hashedKey: `subject-key-${suffix}`,
      keyPrefix: `lin_app_${suffix}`,
    })
    .returning()
  return key
}

async function createActor(tx: DbClient, suffix: string) {
  const [actor] = await tx
    .insert(users)
    .values({ name: "Admin", email: `subject-admin-${suffix}@example.com` })
    .returning()
  return actor
}

describe("External Subject repository", () => {
  it("provisions idempotently from the Application issuer", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplication(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createApplicationKey(
        tx,
        organization.id,
        application.id,
        application.id
      )
      const first = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          issuerSubject: "customer-123",
          metadata: { prospect: "lead-1" },
        },
        key.id
      )
      const second = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          issuerSubject: "customer-123",
          metadata: { prospect: "lead-2" },
        },
        key.id
      )
      expect(first.outcome).toBe("provisioned")
      expect(second.outcome).toBe("provisioned")
      if (first.outcome !== "provisioned") return
      if (second.outcome !== "provisioned") return
      expect(second.value.subject.id).toBe(first.value.subject.id)
      expect(second.value.subject.issuer).toBe(application.oidcIssuer)
      expect(second.value.subject.status).toBe("provisioned")
      expect(second.value.application.metadata).toEqual({ prospect: "lead-2" })
      const identities = await tx
        .select()
        .from(externalSubjects)
        .where(eq(externalSubjects.workspaceId, organization.id))
      expect(identities).toHaveLength(1)
      const provisionAudits = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "external_subject.provisioned"))
      expect(provisionAudits).toHaveLength(1)
      expect(provisionAudits[0]?.resourceId).toBe(
        first.value.subject.auditReference
      )
      expect(JSON.stringify(provisionAudits[0])).not.toContain("customer-123")
    })
  })

  it("reuses identity across Applications without sharing metadata", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const issuer = "https://identity.example.com"
      const firstApplication = await createApplication(
        tx,
        organization.id,
        issuer,
        "first"
      )
      const secondApplication = await createApplication(
        tx,
        organization.id,
        issuer,
        "second"
      )
      const firstKey = await createApplicationKey(
        tx,
        organization.id,
        firstApplication.id,
        firstApplication.id
      )
      const secondKey = await createApplicationKey(
        tx,
        organization.id,
        secondApplication.id,
        secondApplication.id
      )
      const first = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: firstApplication.id,
          issuerSubject: "shared-person",
          metadata: { account: "first-account" },
        },
        firstKey.id
      )
      if (first.outcome !== "provisioned") return
      await tx
        .update(externalSubjects)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(eq(externalSubjects.id, first.value.subject.id))
      const second = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: secondApplication.id,
          issuerSubject: "shared-person",
          metadata: { account: "second-account" },
        },
        secondKey.id
      )
      if (second.outcome !== "provisioned") return
      expect(second.value.subject.id).toBe(first.value.subject.id)
      expect(second.value.subject.status).toBe("verified")
      expect(first.value.application.metadata).toEqual({
        account: "first-account",
      })
      expect(second.value.application.metadata).toEqual({
        account: "second-account",
      })
      expect(
        await getApplicationExternalSubject(
          tx,
          organization.id,
          firstApplication.id,
          first.value.subject.id
        )
      ).toMatchObject({
        application: { metadata: { account: "first-account" } },
      })
    })
  })

  it("isolates identities across issuers and workspaces", async () => {
    await withRollback(async (tx) => {
      const firstFixtures = await createTestFixtures(tx)
      const secondFixtures = await createTestFixtures(tx)
      const firstApplication = await createApplication(
        tx,
        firstFixtures.organization.id,
        "https://first.example.com",
        "first"
      )
      const otherIssuerApplication = await createApplication(
        tx,
        firstFixtures.organization.id,
        "https://second.example.com",
        "second"
      )
      const otherWorkspaceApplication = await createApplication(
        tx,
        secondFixtures.organization.id,
        "https://first.example.com",
        "other-workspace"
      )
      const configurations = [
        [firstFixtures.organization.id, firstApplication],
        [firstFixtures.organization.id, otherIssuerApplication],
        [secondFixtures.organization.id, otherWorkspaceApplication],
      ] as const
      const subjectIds: string[] = []
      for (const [workspaceId, application] of configurations) {
        const key = await createApplicationKey(
          tx,
          workspaceId,
          application.id,
          application.id
        )
        const result = await provisionExternalSubject(
          tx,
          {
            workspaceId,
            applicationId: application.id,
            issuerSubject: "same-value",
            metadata: {},
          },
          key.id
        )
        if (result.outcome === "provisioned") {
          subjectIds.push(result.value.subject.id)
        }
      }
      expect(new Set(subjectIds).size).toBe(3)
      expect(
        await getApplicationExternalSubject(
          tx,
          secondFixtures.organization.id,
          otherWorkspaceApplication.id,
          subjectIds[0] ?? ""
        )
      ).toBeUndefined()
    })
  })

  it("rejects disabled Applications and External Subjects", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplication(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createApplicationKey(
        tx,
        organization.id,
        application.id,
        application.id
      )
      await tx
        .update(applications)
        .set({ enabled: false })
        .where(eq(applications.id, application.id))
      expect(
        await provisionExternalSubject(
          tx,
          {
            workspaceId: organization.id,
            applicationId: application.id,
            issuerSubject: "blocked",
            metadata: {},
          },
          key.id
        )
      ).toEqual({ outcome: "application_disabled" })
      await tx
        .update(applications)
        .set({ enabled: true })
        .where(eq(applications.id, application.id))
      const created = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          issuerSubject: "disabled-subject",
          metadata: {},
        },
        key.id
      )
      if (created.outcome !== "provisioned") return
      const actor = await createActor(tx, organization.id)
      await disableExternalSubject(
        tx,
        organization.id,
        created.value.subject.id,
        actor.id
      )
      expect(
        await provisionExternalSubject(
          tx,
          {
            workspaceId: organization.id,
            applicationId: application.id,
            issuerSubject: "disabled-subject",
            metadata: {},
          },
          key.id
        )
      ).toEqual({ outcome: "external_subject_disabled" })
    })
  })

  it("erases identity and Application metadata but retains pseudonymous audit", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const application = await createApplication(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createApplicationKey(
        tx,
        organization.id,
        application.id,
        application.id
      )
      const created = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          applicationId: application.id,
          issuerSubject: "erase-me",
          metadata: { prospect: "sensitive-reference" },
        },
        key.id
      )
      if (created.outcome !== "provisioned") return
      const actor = await createActor(tx, organization.id)
      const erased = await eraseExternalSubject(
        tx,
        organization.id,
        created.value.subject.id,
        actor.id
      )
      expect(erased).toMatchObject({
        issuerSubject: null,
        status: "erased",
      })
      expect(erased?.auditReference).not.toBe(
        created.value.subject.auditReference
      )
      expect(
        await findExternalSubjectByIdentity(
          tx,
          organization.id,
          application.oidcIssuer,
          "erase-me"
        )
      ).toBeUndefined()
      const [link] = await tx
        .select()
        .from(externalSubjectApplications)
        .where(
          and(
            eq(externalSubjectApplications.applicationId, application.id),
            eq(
              externalSubjectApplications.externalSubjectId,
              created.value.subject.id
            )
          )
        )
      expect(link?.metadata).toEqual({})
      const [audit] = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "external_subject.erased"))
      expect(audit?.resourceId).toBe(erased?.auditReference)
      expect(JSON.stringify(audit)).not.toContain("erase-me")
      expect(JSON.stringify(audit)).not.toContain("sensitive-reference")
    })
  })
})

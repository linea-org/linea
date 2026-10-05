import { fixtureIssuer } from "./test-utils.js"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  applications,
  environmentKeys,
  environments,
  auditLogs,
  externalSubjectEnvironments,
  externalSubjects,
  users,
} from "../schema/index.js"
import {
  disableExternalSubject,
  eraseExternalSubject,
  findExternalSubjectByIdentity,
  getEnvironmentExternalSubject,
  provisionExternalSubject,
} from "./external-subject.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

async function createEnvironment(
  tx: DbClient,
  workspaceId: string,
  issuer: string,
  name: string
) {
  const [environment] = await tx
    .insert(environments)
    .values({
      applicationId: (
        await tx
          .insert(applications)
          .values({
            workspaceId,
            name: "Test product",
            slug: crypto.randomUUID(),
          })
          .returning()
      )[0].id,
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
  return environment
}

async function createEnvironmentKey(
  tx: DbClient,
  workspaceId: string,
  environmentId: string,
  suffix: string
) {
  const [key] = await tx
    .insert(environmentKeys)
    .values({
      workspaceId,
      environmentId,
      name: "Subject provisioner",
      scopes: ["subjects:provision"],
      hashedKey: `subject-key-${suffix}`,
      keyPrefix: `lin_env_${suffix}`,
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
  it("provisions idempotently from the Environment issuer", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironment(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        environment.id
      )
      const first = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
          issuerSubject: "customer-123",
          metadata: { prospect: "lead-1" },
        },
        key.id
      )
      const second = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
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
      expect(second.value.subject.issuer).toBe(fixtureIssuer(environment))
      expect(second.value.subject.status).toBe("provisioned")
      expect(second.value.environment.metadata).toEqual({ prospect: "lead-2" })
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
  it("reuses identity across Environments without sharing metadata", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const issuer = "https://identity.example.com"
      const firstEnvironment = await createEnvironment(
        tx,
        organization.id,
        issuer,
        "first"
      )
      const secondEnvironment = await createEnvironment(
        tx,
        organization.id,
        issuer,
        "second"
      )
      const firstKey = await createEnvironmentKey(
        tx,
        organization.id,
        firstEnvironment.id,
        firstEnvironment.id
      )
      const secondKey = await createEnvironmentKey(
        tx,
        organization.id,
        secondEnvironment.id,
        secondEnvironment.id
      )
      const first = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          environmentId: firstEnvironment.id,
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
          environmentId: secondEnvironment.id,
          issuerSubject: "shared-person",
          metadata: { account: "second-account" },
        },
        secondKey.id
      )
      if (second.outcome !== "provisioned") return
      expect(second.value.subject.id).toBe(first.value.subject.id)
      expect(second.value.subject.status).toBe("verified")
      expect(first.value.environment.metadata).toEqual({
        account: "first-account",
      })
      expect(second.value.environment.metadata).toEqual({
        account: "second-account",
      })
      expect(
        await getEnvironmentExternalSubject(
          tx,
          organization.id,
          firstEnvironment.id,
          first.value.subject.id
        )
      ).toMatchObject({
        environment: { metadata: { account: "first-account" } },
      })
    })
  })
  it("isolates identities across issuers and workspaces", async () => {
    await withRollback(async (tx) => {
      const firstFixtures = await createTestFixtures(tx)
      const secondFixtures = await createTestFixtures(tx)
      const firstEnvironment = await createEnvironment(
        tx,
        firstFixtures.organization.id,
        "https://first.example.com",
        "first"
      )
      const otherIssuerEnvironment = await createEnvironment(
        tx,
        firstFixtures.organization.id,
        "https://second.example.com",
        "second"
      )
      const otherWorkspaceEnvironment = await createEnvironment(
        tx,
        secondFixtures.organization.id,
        "https://first.example.com",
        "other-workspace"
      )
      const configurations = [
        [firstFixtures.organization.id, firstEnvironment],
        [firstFixtures.organization.id, otherIssuerEnvironment],
        [secondFixtures.organization.id, otherWorkspaceEnvironment],
      ] as const
      const subjectIds: string[] = []
      for (const [workspaceId, environment] of configurations) {
        const key = await createEnvironmentKey(
          tx,
          workspaceId,
          environment.id,
          environment.id
        )
        const result = await provisionExternalSubject(
          tx,
          {
            workspaceId,
            environmentId: environment.id,
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
        await getEnvironmentExternalSubject(
          tx,
          secondFixtures.organization.id,
          otherWorkspaceEnvironment.id,
          subjectIds[0] ?? ""
        )
      ).toBeUndefined()
    })
  })
  it("rejects disabled Environments and External Subjects", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironment(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        environment.id
      )
      await tx
        .update(environments)
        .set({ enabled: false })
        .where(eq(environments.id, environment.id))
      expect(
        await provisionExternalSubject(
          tx,
          {
            workspaceId: organization.id,
            environmentId: environment.id,
            issuerSubject: "blocked",
            metadata: {},
          },
          key.id
        )
      ).toEqual({ outcome: "environment_disabled" })
      await tx
        .update(environments)
        .set({ enabled: true })
        .where(eq(environments.id, environment.id))
      const created = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
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
            environmentId: environment.id,
            issuerSubject: "disabled-subject",
            metadata: {},
          },
          key.id
        )
      ).toEqual({ outcome: "external_subject_disabled" })
    })
  })
  it("erases identity and Environment metadata but retains pseudonymous audit", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const environment = await createEnvironment(
        tx,
        organization.id,
        "https://identity.example.com",
        "portal"
      )
      const key = await createEnvironmentKey(
        tx,
        organization.id,
        environment.id,
        environment.id
      )
      const created = await provisionExternalSubject(
        tx,
        {
          workspaceId: organization.id,
          environmentId: environment.id,
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
          fixtureIssuer(environment),
          "erase-me"
        )
      ).toBeUndefined()
      const [link] = await tx
        .select()
        .from(externalSubjectEnvironments)
        .where(
          and(
            eq(externalSubjectEnvironments.environmentId, environment.id),
            eq(
              externalSubjectEnvironments.externalSubjectId,
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

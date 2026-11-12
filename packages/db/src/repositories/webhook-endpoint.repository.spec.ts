import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import { db, pool } from "../clients/index.js"
import {
  environments,
  organizations,
  users,
  webhookEndpoints,
} from "../schema/index.js"
import { getTestApplicationId } from "./test-utils.js"
import {
  createWebhookEndpoint,
  updateWebhookEndpoint,
  disableWebhookEndpoint,
  WebhookEndpointConflictError,
} from "./webhook-endpoint.repository.js"

const workspaceId = randomUUID()
const actorUserId = randomUUID()
let environmentId: string

beforeAll(async () => {
  await db.insert(organizations).values({
    id: workspaceId,
    name: "Webhook quota",
    slug: workspaceId,
    createdAt: new Date(),
  })
  await db.insert(users).values({
    id: actorUserId,
    name: "Admin",
    email: `${actorUserId}@example.com`,
  })
  const [environment] = await db
    .insert(environments)
    .values({
      workspaceId,
      applicationId: await getTestApplicationId(db, workspaceId),
      environment: "production",
      displayName: "Webhook quota",
    })
    .returning()
  environmentId = environment.id
})

beforeEach(async () => {
  await db
    .delete(webhookEndpoints)
    .where(eq(webhookEndpoints.workspaceId, workspaceId))
})

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, workspaceId))
  await db.delete(users).where(eq(users.id, actorUserId))
  await pool.end()
})

function create(url: string) {
  return createWebhookEndpoint(db, {
    workspaceId,
    environmentId,
    actorUserId,
    url,
    currentSecretEncrypted: "encrypted",
  })
}

describe("webhook endpoint admission", () => {
  it("serializes duplicate creation and repointing without a destructive index", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        create(`https://EXAMPLE.com:443/hook#${i}`)
      )
    )
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(11)
    const second = await create("https://example.com/other")
    if (!second) throw new Error("Missing endpoint")
    await expect(
      updateWebhookEndpoint(db, {
        workspaceId,
        environmentId,
        webhookId: second.id,
        actorUserId,
        url: "https://example.com/hook",
      })
    ).rejects.toBeInstanceOf(WebhookEndpointConflictError)
    await disableWebhookEndpoint(db, {
      workspaceId,
      environmentId,
      webhookId: second.id,
      actorUserId,
      now: new Date(),
    })
    expect(await create("https://example.com/other")).toBeDefined()
  })
  it("cannot race the environment cap and preserves preexisting endpoints", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        create(`https://quota.example.com/${i}`)
      )
    )
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(10)
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.workspaceId, workspaceId))
    expect(endpoints.filter((endpoint) => !endpoint.disabledAt)).toHaveLength(
      10
    )
  })
  it("bounds workspace fanout across environments and grandfathers existing rows", async () => {
    const applicationId = await getTestApplicationId(db, workspaceId)
    const [environment] = await db
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.applicationId, applicationId),
          eq(environments.environment, "dev")
        )
      )
    await db.insert(webhookEndpoints).values(
      Array.from({ length: 99 }, (_, i) => ({
        workspaceId,
        environmentId,
        url: `https://legacy.example.com/${i}`,
        currentSecretEncrypted: "encrypted",
      }))
    )
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        createWebhookEndpoint(db, {
          workspaceId,
          environmentId: environment.id,
          actorUserId,
          url: `https://new.example.com/${i}`,
          currentSecretEncrypted: "encrypted",
        })
      )
    )
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(11)
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.workspaceId, workspaceId))
    expect(endpoints.filter((endpoint) => !endpoint.disabledAt)).toHaveLength(
      100
    )
  })
})

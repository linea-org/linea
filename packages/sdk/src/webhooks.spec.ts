import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { verifyWebhook, verifyWebhookSignature } from "./webhooks.js"

function signature(
  secret: string,
  timestamp: string,
  eventId: string,
  body: Uint8Array
): string {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.`)
    .update(body)
    .digest("hex")}`
}

describe("verifyWebhookSignature", () => {
  const now = new Date("2026-09-18T12:00:00.000Z")
  const timestamp = String(now.getTime() / 1_000)
  const eventId = "event-1"
  const body = Buffer.from('{"message":"café"}', "utf8")

  it("verifies the exact request bytes", () => {
    const result = verifyWebhookSignature({
      body,
      eventId,
      timestamp,
      signature: signature("current", timestamp, eventId, body),
      currentSecret: "current",
      previousSecret: null,
      previousSecretExpiresAt: null,
      now,
      timestampToleranceSeconds: 300,
    })
    expect(result).toEqual({ valid: true, secret: "current" })
    expect(
      verifyWebhookSignature({
        body: Buffer.from('{"message":"cafe"}', "utf8"),
        eventId,
        timestamp,
        signature: signature("current", timestamp, eventId, body),
        currentSecret: "current",
        previousSecret: null,
        previousSecretExpiresAt: null,
        now,
        timestampToleranceSeconds: 300,
      })
    ).toEqual({ valid: false })
  })

  it("accepts the previous secret only during its grace period", () => {
    const previousSignature = signature("previous", timestamp, eventId, body)
    expect(
      verifyWebhookSignature({
        body,
        eventId,
        timestamp,
        signature: previousSignature,
        currentSecret: "current",
        previousSecret: "previous",
        previousSecretExpiresAt: new Date(now.getTime() + 1_000),
        now,
        timestampToleranceSeconds: 300,
      })
    ).toEqual({ valid: true, secret: "previous" })
    expect(
      verifyWebhookSignature({
        body,
        eventId,
        timestamp,
        signature: previousSignature,
        currentSecret: "current",
        previousSecret: "previous",
        previousSecretExpiresAt: new Date(now.getTime() - 1_000),
        now,
        timestampToleranceSeconds: 300,
      })
    ).toEqual({ valid: false })
  })

  it("rejects timestamps outside the bounded tolerance", () => {
    expect(
      verifyWebhookSignature({
        body,
        eventId,
        timestamp: String(now.getTime() / 1_000 - 301),
        signature: signature(
          "current",
          String(now.getTime() / 1_000 - 301),
          eventId,
          body
        ),
        currentSecret: "current",
        previousSecret: null,
        previousSecretExpiresAt: null,
        now,
        timestampToleranceSeconds: 300,
      })
    ).toEqual({ valid: false })
  })
})

describe("verifyWebhook", () => {
  const now = new Date("2026-09-18T12:00:00.000Z")
  const timestamp = String(now.getTime() / 1_000)
  const eventId = "event-1"
  const secret = "current"
  const envelope = {
    id: eventId,
    type: "execution.completed",
    version: 1,
    createdAt: now.toISOString(),
    applicationId: "application-1",
    data: {
      executionId: "00000000-0000-4000-8000-000000000001",
      status: "succeeded",
    },
  }

  function input(body: Uint8Array, id = eventId) {
    return {
      body,
      eventId: id,
      timestamp,
      signature: signature(secret, timestamp, id, body),
      currentSecret: secret,
      previousSecret: null,
      previousSecretExpiresAt: null,
      now,
      timestampToleranceSeconds: 300,
    }
  }

  it("returns the typed envelope after verifying its exact bytes", () => {
    const body = Buffer.from(JSON.stringify(envelope))
    expect(verifyWebhook(input(body))).toEqual({
      valid: true,
      secret: "current",
      envelope,
    })
  })

  it("gives receivers a stable verified event ID for retry deduplication", () => {
    const body = Buffer.from(JSON.stringify(envelope))
    const handled = new Set<string>()
    let effects = 0
    for (const delivery of [
      verifyWebhook(input(body)),
      verifyWebhook(input(body)),
    ]) {
      if (!delivery.valid || handled.has(delivery.envelope.id)) continue
      handled.add(delivery.envelope.id)
      effects += 1
    }
    expect(effects).toBe(1)
    expect(handled).toEqual(new Set([eventId]))
  })

  it("rejects an event ID that does not match the signed envelope", () => {
    const body = Buffer.from(JSON.stringify(envelope))
    expect(verifyWebhook(input(body, "event-2"))).toEqual({
      valid: false,
      reason: "event_id_mismatch",
    })
  })

  it("rejects unsupported envelope versions and event data", () => {
    for (const candidate of [
      { ...envelope, version: 2 },
      {
        ...envelope,
        data: {
          executionId: "00000000-0000-4000-8000-000000000001",
          status: "pending",
        },
      },
    ]) {
      const body = Buffer.from(JSON.stringify(candidate))
      expect(verifyWebhook(input(body))).toEqual({
        valid: false,
        reason: "body_invalid",
      })
    }
  })

  it("rejects malformed event IDs and invalid JSON", () => {
    const invalidJson = Buffer.from("{")
    expect(verifyWebhook(input(invalidJson))).toEqual({
      valid: false,
      reason: "body_invalid",
    })
    const body = Buffer.from(JSON.stringify(envelope))
    expect(verifyWebhook(input(body, "event id"))).toEqual({
      valid: false,
      reason: "event_id_invalid",
    })
  })
})

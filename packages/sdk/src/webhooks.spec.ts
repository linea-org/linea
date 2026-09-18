import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { verifyWebhookSignature } from "./webhooks.js"

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

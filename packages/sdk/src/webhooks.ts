import { createHmac, timingSafeEqual } from "node:crypto"
import { eventIdSchema } from "@linea/protocol/shared"
import {
  webhookEnvelopeSchema,
  type WebhookEnvelope,
} from "@linea/protocol/webhooks"

export type VerifyWebhookSignatureInput = {
  body: Uint8Array
  eventId: string
  timestamp: string
  signature: string
  currentSecret: string
  previousSecret: string | null
  previousSecretExpiresAt: Date | null
  now: Date
  timestampToleranceSeconds: number
}

export type WebhookVerificationResult =
  | { valid: true; secret: "current" | "previous" }
  | { valid: false }

export type VerifiedWebhook = {
  valid: true
  secret: "current" | "previous"
  envelope: WebhookEnvelope
}

export type WebhookVerification =
  | VerifiedWebhook
  | {
      valid: false
      reason:
        | "signature_invalid"
        | "body_invalid"
        | "event_id_invalid"
        | "event_id_mismatch"
    }

function expectedSignature(
  secret: string,
  timestamp: string,
  eventId: string,
  body: Uint8Array
): Buffer {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.`)
    .update(body)
    .digest()
}

function matches(
  signature: string,
  secret: string,
  timestamp: string,
  eventId: string,
  body: Uint8Array
): boolean {
  const match = /^v1=([a-f0-9]{64})$/.exec(signature)
  if (!match?.[1]) return false
  const received = Buffer.from(match[1], "hex")
  const expected = expectedSignature(secret, timestamp, eventId, body)
  return timingSafeEqual(received, expected)
}

export function verifyWebhookSignature(
  input: VerifyWebhookSignatureInput
): WebhookVerificationResult {
  if (
    !Number.isInteger(input.timestampToleranceSeconds) ||
    input.timestampToleranceSeconds < 1 ||
    input.timestampToleranceSeconds > 300
  ) {
    throw new Error("Timestamp tolerance must be between 1 and 300 seconds")
  }
  const timestampSeconds = Number(input.timestamp)
  if (!Number.isInteger(timestampSeconds)) return { valid: false }
  const ageSeconds = Math.abs(input.now.getTime() / 1_000 - timestampSeconds)
  if (ageSeconds > input.timestampToleranceSeconds) return { valid: false }
  if (
    matches(
      input.signature,
      input.currentSecret,
      input.timestamp,
      input.eventId,
      input.body
    )
  ) {
    return { valid: true, secret: "current" }
  }
  if (
    input.previousSecret &&
    input.previousSecretExpiresAt &&
    input.previousSecretExpiresAt >= input.now &&
    matches(
      input.signature,
      input.previousSecret,
      input.timestamp,
      input.eventId,
      input.body
    )
  ) {
    return { valid: true, secret: "previous" }
  }
  return { valid: false }
}

export function verifyWebhook(
  input: VerifyWebhookSignatureInput
): WebhookVerification {
  if (!eventIdSchema.safeParse(input.eventId).success) {
    return { valid: false, reason: "event_id_invalid" }
  }
  const signature = verifyWebhookSignature(input)
  if (!signature.valid) return { valid: false, reason: "signature_invalid" }
  let body: unknown
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(input.body)
    )
  } catch {
    return { valid: false, reason: "body_invalid" }
  }
  const envelope = webhookEnvelopeSchema.safeParse(body)
  if (!envelope.success) return { valid: false, reason: "body_invalid" }
  if (envelope.data.id !== input.eventId) {
    return { valid: false, reason: "event_id_mismatch" }
  }
  return { valid: true, secret: signature.secret, envelope: envelope.data }
}

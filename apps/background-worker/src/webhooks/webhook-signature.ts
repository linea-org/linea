import { createHmac } from "node:crypto"

export const WEBHOOK_SIGNATURE_VERSION = "v1"

export function signWebhook(
  secret: string,
  timestamp: string,
  eventId: string,
  body: Buffer
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.`)
    .update(body)
    .digest("hex")
  return `${WEBHOOK_SIGNATURE_VERSION}=${signature}`
}

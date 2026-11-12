import { requestPublic } from "@linea/http"

export type WebhookResponse = {
  status: number
  body: string
}

export async function deliverWebhook(input: {
  signal: AbortSignal
  url: string
  headers: Record<string, string>
  body: Buffer
  allowLocalDevelopment: boolean
}): Promise<WebhookResponse> {
  const response = await requestPublic(input.url, {
    method: "POST",
    headers: input.headers,
    body: input.body,
    signal: input.signal,
    timeoutMs: 10_000,
    maxResponseBytes: 1_048_576,
    allowLocalDevelopment: input.allowLocalDevelopment,
    requireHttps: true,
    redirectMode: "same-origin",
  })
  return {
    status: response.status,
    body: Buffer.from(await response.text())
      .subarray(0, 4_096)
      .toString("utf8"),
  }
}

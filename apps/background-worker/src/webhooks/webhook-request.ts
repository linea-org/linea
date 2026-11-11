import { requestPublic } from "@linea/http"

export type WebhookResponse = {
  status: number
  body: string
}

export async function deliverWebhook(input: {
  url: string
  headers: Record<string, string>
  body: Buffer
  allowLocalDevelopment: boolean
}): Promise<WebhookResponse> {
  const response = await requestPublic(input.url, {
    method: "POST",
    headers: input.headers,
    body: input.body,
    signal: undefined,
    timeoutMs: 10_000,
    maxResponseBytes: 1_048_576,
    allowLocalDevelopment: input.allowLocalDevelopment,
    requireHttps: true,
    redirectMode: "preserve",
  })
  return {
    status: response.status,
    body: Buffer.from(await response.text())
      .subarray(0, 4_096)
      .toString("utf8"),
  }
}

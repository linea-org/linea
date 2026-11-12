import { requestPublic } from "@linea/http"
import { deliverWebhook } from "./webhook-request"

jest.mock("@linea/http", () => ({ requestPublic: jest.fn() }))

it("delivers signed payloads with HTTPS, pinned redirects, and bounded resource use", async () => {
  jest
    .mocked(requestPublic)
    .mockResolvedValue(new Response("ok", { status: 202 }))
  const body = Buffer.from("{}")
  await expect(
    deliverWebhook({
      signal: new AbortController().signal,
      url: "https://receiver.example/hook",
      headers: { "x-linea-signature": "signature" },
      body,
      allowLocalDevelopment: false,
    })
  ).resolves.toEqual({ status: 202, body: "ok" })
  expect(requestPublic).toHaveBeenCalledWith(
    "https://receiver.example/hook",
    expect.objectContaining({
      method: "POST",
      body,
      requireHttps: true,
      redirectMode: "same-origin",
      allowLocalDevelopment: false,
      timeoutMs: 10_000,
      maxResponseBytes: 1_048_576,
    })
  )
})

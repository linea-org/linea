import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"

export type SecretSummary = {
  id: string
  key: string
  createdAt: string
  updatedAt: string
}

async function parseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string
  } | null
  return body?.message ?? fallback
}

export const listSecretsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SecretSummary[]> => {
    const res = await apiFetch("/secrets")
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not load secrets"))
    }
    return (await res.json()) as SecretSummary[]
  }
)

export type AiProviderKeyStatus = {
  id: string
  label: string
  keyName: string
  configured: boolean
}

export const listAiProvidersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiProviderKeyStatus[]> => {
    const res = await apiFetch("/secrets/providers")
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not load AI provider keys")
      )
    }
    return (await res.json()) as AiProviderKeyStatus[]
  }
)

export const upsertSecretFn = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; value: string }) => data)
  .handler(async ({ data }): Promise<SecretSummary> => {
    const res = await apiFetch(`/secrets/${encodeURIComponent(data.key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: data.value }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not save secret"))
    }
    return (await res.json()) as SecretSummary
  })

export const deleteSecretFn = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/secrets/${encodeURIComponent(data.key)}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not delete secret"))
    }
  })

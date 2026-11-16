import { RECENT_AUTHENTICATION_REQUIRED } from "@linea/auth/session-policy"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { STEP_UP_REQUIRED_MESSAGE } from "./step-up-message"

function internalApiUrl() {
  return process.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000"
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = getRequestHeaders()
  const cookie = headers.get("cookie") ?? ""
  const res = await fetch(`${internalApiUrl()}/v1${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie,
    },
  })
  return res
}

export async function parseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string
    code?: string
  } | null
  if (body?.code === RECENT_AUTHENTICATION_REQUIRED) {
    return STEP_UP_REQUIRED_MESSAGE
  }
  return body?.message ?? fallback
}

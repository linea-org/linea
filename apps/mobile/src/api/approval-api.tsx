import { createContext, type ReactNode, useContext } from "react"
import { Platform } from "react-native"
import type { z } from "zod"
import type { ApprovalRequest } from "./approval-types"
import { approvalRequestSchema, approvalRequestsSchema } from "./approval-types"

const DECISION_TIMEOUT_MS = 15_000

export class ApprovalApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined
  ) {
    super(message)
    this.name = "ApprovalApiError"
  }
}

export type ApprovalApi = {
  listApprovals: () => Promise<ApprovalRequest[]>
  getApproval: (approvalId: string) => Promise<ApprovalRequest>
  respondToApproval: (
    approvalId: string,
    outcome: "approved" | "rejected"
  ) => Promise<ApprovalRequest>
}

const ApprovalApiContext = createContext<ApprovalApi | null>(null)

export function ApprovalApiProvider({
  api,
  children,
}: {
  api: ApprovalApi
  children: ReactNode
}) {
  return (
    <ApprovalApiContext.Provider value={api}>
      {children}
    </ApprovalApiContext.Provider>
  )
}

export function useApprovalApi() {
  const api = useContext(ApprovalApiContext)
  if (!api) throw new Error("ApprovalApiProvider is required")
  return api
}

export function createApprovalApi({
  baseUrl,
  getCookie,
}: {
  baseUrl: string
  getCookie: () => string
}): ApprovalApi {
  function headers(contentType = false) {
    const cookie = getCookie()
    return {
      ...(contentType ? { "content-type": "application/json" } : {}),
      ...(Platform.OS !== "web" && cookie ? { cookie } : {}),
    }
  }
  async function parse<T>(response: Response, schema: z.ZodType<T>) {
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : `Request failed (${response.status})`
      throw new ApprovalApiError(message, response.status)
    }
    const body: unknown = await response.json()
    return schema.parse(body)
  }
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetch(`${baseUrl}/v1${path}`, {
      credentials: Platform.OS === "web" ? "include" : "omit",
      headers: headers(),
    })
    return parse(response, schema)
  }
  async function respondToApproval(
    approvalId: string,
    outcome: "approved" | "rejected"
  ) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS)
    try {
      const response = await fetch(
        `${baseUrl}/v1/approvals/${encodeURIComponent(approvalId)}/respond`,
        {
          method: "POST",
          credentials: Platform.OS === "web" ? "include" : "omit",
          headers: headers(true),
          body: JSON.stringify({ approved: outcome === "approved" }),
          signal: controller.signal,
        }
      )
      return await parse(response, approvalRequestSchema)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApprovalApiError("The decision request timed out", undefined)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  return {
    listApprovals: () => get("/approvals", approvalRequestsSchema),
    getApproval: (approvalId) =>
      get(
        `/approvals/${encodeURIComponent(approvalId)}`,
        approvalRequestSchema
      ),
    respondToApproval,
  }
}

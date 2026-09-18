import { createContext, type ReactNode, useContext } from "react"
import type { z } from "zod"
import type {
  ExecutionDetail,
  ExecutionPage,
  SignalSummary,
} from "./monitoring-types"
import {
  executionDetailSchema,
  executionPageSchema,
  signalsSchema,
} from "./monitoring-types"

export type MonitoringApi = {
  listExecutions: () => Promise<ExecutionPage>
  getExecution: (executionId: string) => Promise<ExecutionDetail>
  listSignals: () => Promise<SignalSummary[]>
}

const MonitoringApiContext = createContext<MonitoringApi | null>(null)

export function MonitoringApiProvider({
  api,
  children,
}: {
  api: MonitoringApi
  children: ReactNode
}) {
  return (
    <MonitoringApiContext.Provider value={api}>
      {children}
    </MonitoringApiContext.Provider>
  )
}

export function useMonitoringApi() {
  const api = useContext(MonitoringApiContext)
  if (!api) throw new Error("MonitoringApiProvider is required")
  return api
}

export function createMonitoringApi({
  baseUrl,
  getCookie,
}: {
  baseUrl: string
  getCookie: () => string
}): MonitoringApi {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const cookie = getCookie()
    const response = await fetch(`${baseUrl}/v1${path}`, {
      headers: cookie ? { cookie } : undefined,
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : `Request failed (${response.status})`
      throw new Error(message)
    }
    const body: unknown = await response.json()
    return schema.parse(body)
  }
  return {
    listExecutions: () => get("/executions", executionPageSchema),
    getExecution: (executionId) =>
      get(
        `/executions/${encodeURIComponent(executionId)}`,
        executionDetailSchema
      ),
    listSignals: () => get("/signals", signalsSchema),
  }
}

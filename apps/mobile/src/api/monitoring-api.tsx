import { createContext, type ReactNode, useContext } from "react"
import { Platform } from "react-native"
import type { z } from "zod"
import type {
  ExecutionDetail,
  ExecutionPage,
  SignalSummary,
  SignalDetail,
} from "./monitoring-types"
import {
  executionDetailSchema,
  executionPageSchema,
  signalsSchema,
  signalDetailSchema,
} from "./monitoring-types"

export type MonitoringApi = {
  listExecutions: () => Promise<ExecutionPage>
  getExecution: (executionId: string) => Promise<ExecutionDetail>
  listSignals: () => Promise<SignalSummary[]>
  getSignal: (signalId: string) => Promise<SignalDetail>
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
      credentials: Platform.OS === "web" ? "include" : "omit",
      headers: Platform.OS !== "web" && cookie ? { cookie } : undefined,
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
  async function listExecutions(): Promise<ExecutionPage> {
    const firstPage = await get("/executions", executionPageSchema)
    const executions = [...firstPage.executions]
    let page = firstPage
    while (page.hasMore) {
      const lastExecution = page.executions.at(-1)
      if (!lastExecution) {
        throw new Error("Execution page reported more results without a cursor")
      }
      const cursor = encodeURIComponent(
        `${lastExecution.createdAt}_${lastExecution.id}`
      )
      page = await get(`/executions?cursor=${cursor}`, executionPageSchema)
      executions.push(...page.executions)
    }
    return { executions, hasMore: false, total: firstPage.total }
  }
  return {
    listExecutions,
    getExecution: (executionId) =>
      get(
        `/executions/${encodeURIComponent(executionId)}`,
        executionDetailSchema
      ),
    listSignals: () => get("/signals", signalsSchema),
    getSignal: (signalId) =>
      get(`/signals/${encodeURIComponent(signalId)}`, signalDetailSchema),
  }
}

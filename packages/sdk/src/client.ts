import { request } from "./http/fetch-client.js"
import type {
  CountNewExecutionsParams,
  Execution,
  ExecutionDetail,
  ListExecutionsParams,
  Signal,
  SignalDetailResponse,
  SignalEnvironment,
  SignalSummary,
  SignalTrendPoint,
  WorkspaceExecutionPage,
} from "./types/index.js"

export type LineaClientOptions = {
  /** A workspace API key, created via the dashboard's Settings → API Keys page. Formatted
   * `lin_...`; see the README for how to obtain one. */
  apiKey: string
  /** Defaults to `http://localhost:3000`, matching the platform's own local-dev convention. Pass
   * explicitly for any non-local deployment. */
  baseUrl?: string
}

const DEFAULT_BASE_URL = "http://localhost:3000"

/**
 * Node-only HTTP client for the Linea platform API's trigger, execution, and signal endpoints.
 *
 * Do NOT construct this in a browser or any code shipped to an end user's device. The API key is
 * a bearer credential scoped to an entire workspace with no finer-grained permissions, and the
 * platform's CORS allowlist only blocks browser requests that carry an `Origin` header — it does
 * not protect a key embedded in client-side JS from a non-browser caller who obtains it. Use this
 * only from trusted server-side code.
 */
export class LineaClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: LineaClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  private request<T>(config: {
    method: "GET" | "POST"
    path: string
    query?: Record<string, string | undefined>
    body?: unknown
  }): Promise<T> {
    return request<T>({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      ...config,
    })
  }

  /**
   * Triggers a workflow by its slug. `payload` becomes the execution's `triggerPayload`, available
   * to the workflow's nodes. There is no `environment` parameter — this route always runs the
   * workflow as `dev` (use the dashboard's own trigger UI for a `production` run).
   */
  triggerWorkflow(
    slug: string,
    payload?: Record<string, unknown>
  ): Promise<Execution> {
    return this.request<Execution>({
      method: "POST",
      path: `/triggers/${encodeURIComponent(slug)}`,
      body: payload,
    })
  }

  /** Reads one execution's full detail: the execution row, every step, each step's resolved node
   * config, whether it's replayable, and (if paused) which node it's paused at. */
  getExecution(executionId: string): Promise<ExecutionDetail> {
    return this.request<ExecutionDetail>({
      method: "GET",
      path: `/executions/${encodeURIComponent(executionId)}`,
    })
  }

  /** Lists a single workflow's executions, newest first. Capped at 50 rows server-side — there is
   * currently no paginated way to read more than that for one workflow. */
  listWorkflowExecutions(workflowId: string): Promise<Execution[]> {
    return this.request<Execution[]>({
      method: "GET",
      path: `/workflows/${encodeURIComponent(workflowId)}/executions`,
    })
  }

  /** Lists executions across the whole workspace, cursor-paginated. Build the next page's `cursor`
   * from the last row of the current page with `nextExecutionsCursor`. */
  listExecutions(
    params: ListExecutionsParams = {}
  ): Promise<WorkspaceExecutionPage> {
    return this.request<WorkspaceExecutionPage>({
      method: "GET",
      path: "/executions",
      query: {
        status: params.status,
        trigger: params.trigger,
        cursor: params.cursor,
      },
    })
  }

  /** Counts executions created after `since` (an opaque cursor, same format as
   * `ListExecutionsParams.cursor`) — useful for a lightweight "N new" badge without paging through
   * full rows. */
  countNewExecutions(params: CountNewExecutionsParams): Promise<number> {
    return this.request<number>({
      method: "GET",
      path: "/executions/new-count",
      query: {
        since: params.since,
        status: params.status,
        trigger: params.trigger,
      },
    })
  }

  /** Lists signals (recurring detected problem patterns), optionally scoped to one workflow. Not
   * paginated. */
  listSignals(params: { workflowId?: string } = {}): Promise<SignalSummary[]> {
    return this.request<SignalSummary[]>({
      method: "GET",
      path: "/signals",
      query: { workflowId: params.workflowId },
    })
  }

  /** Daily signal-occurrence counts, optionally scoped to one workflow. */
  getSignalsTrend(
    params: { workflowId?: string } = {}
  ): Promise<SignalTrendPoint[]> {
    return this.request<SignalTrendPoint[]>({
      method: "GET",
      path: "/signals/trend",
      query: { workflowId: params.workflowId },
    })
  }

  /** Reads one signal's full detail, including its model/provider occurrence breakdown (see
   * `SignalDetailResponse.dimensionsApplicable`/`dimensions`). `environment` is left unset by
   * default rather than the SDK inventing its own default — the server defaults it to
   * `"production"`, and stays the single source of truth for that choice. */
  getSignal(
    signalId: string,
    params: { environment?: SignalEnvironment } = {}
  ): Promise<SignalDetailResponse> {
    return this.request<SignalDetailResponse>({
      method: "GET",
      path: `/signals/${encodeURIComponent(signalId)}`,
      query: { environment: params.environment },
    })
  }

  /** Marks a signal resolved. */
  resolveSignal(signalId: string): Promise<Signal> {
    return this.request<Signal>({
      method: "POST",
      path: `/signals/${encodeURIComponent(signalId)}/resolve`,
    })
  }
}

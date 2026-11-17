import type {
  Signal,
  SignalDetailResponse,
  SignalEnvironment,
  SignalSummary,
  SignalTrendPoint,
} from "../types/index.js"
import { path, type WorkspaceRequest } from "./workspace-request.js"

export class Signals {
  constructor(private readonly send: WorkspaceRequest) {}

  list(params: { workflowId?: string } = {}): Promise<SignalSummary[]> {
    return this.send({
      method: "GET",
      path: "/signals",
      query: { workflowId: params.workflowId },
    })
  }

  /** Daily occurrence counts. */
  trend(params: { workflowId?: string } = {}): Promise<SignalTrendPoint[]> {
    return this.send({
      method: "GET",
      path: "/signals/trend",
      query: { workflowId: params.workflowId },
    })
  }

  /** `environment` defaults to production on the server. */
  get(
    signalId: string,
    params: { environment?: SignalEnvironment } = {}
  ): Promise<SignalDetailResponse> {
    return this.send({
      method: "GET",
      path: path`/signals/${signalId}`,
      query: { environment: params.environment },
    })
  }

  resolve(signalId: string): Promise<Signal> {
    return this.send({
      method: "POST",
      path: path`/signals/${signalId}/resolve`,
    })
  }
}

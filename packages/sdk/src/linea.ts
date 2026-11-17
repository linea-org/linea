import { workspaceKey } from "./server/credentials.js"
import { ServerTransport } from "./server/transport.js"
import { AuditEvents } from "./workspace/audit-events.js"
import { Executions } from "./workspace/executions.js"
import { Regressions } from "./workspace/regressions.js"
import { Signals } from "./workspace/signals.js"
import { Workflows } from "./workspace/workflows.js"
import { workspaceRequest } from "./workspace/workspace-request.js"

export type LineaOptions = {
  /** A workspace API key (`lin_...`) from Settings → API keys. */
  apiKey: string
  /** API origin without `/v1`. Defaults to `http://localhost:3000`. */
  baseUrl?: string
}

/** Server-only: the API key grants its scopes across the whole workspace, so never ship it to a
 * browser or device. */
export class Linea {
  readonly workflows: Workflows
  readonly executions: Executions
  readonly signals: Signals
  readonly regressions: Regressions
  readonly auditEvents: AuditEvents

  constructor(options: LineaOptions) {
    const apiKey = workspaceKey(options.apiKey).value
    const baseUrl = options.baseUrl ?? "http://localhost:3000"
    const send = workspaceRequest(baseUrl, apiKey)
    const transport = new ServerTransport(baseUrl, apiKey)
    this.workflows = new Workflows(send)
    this.executions = new Executions(send)
    this.signals = new Signals(send)
    this.regressions = new Regressions(transport)
    this.auditEvents = new AuditEvents(transport)
  }
}

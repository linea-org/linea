import {
  archiveRegressionCaseOperation,
  createRegressionCaseFromFlagOperation,
  createRegressionCaseFromStepOperation,
  getRegressionRunOperation,
  listRegressionCasesOperation,
  listRegressionRunsOperation,
  triggerRegressionRunOperation,
} from "@linea/protocol/operations"
import type {
  CreateRegressionCaseFromFlag,
  CreateRegressionCaseFromStep,
  ListRegressionCases,
  ListRegressionRuns,
  RegressionCase,
  RegressionRun,
  RegressionRunDetail,
  TriggerRegressionRun,
} from "@linea/protocol/resources"
import { LineaClient } from "../client.js"
import type { WorkspaceKey } from "./credentials.js"
import { ServerTransport } from "./transport.js"

const defaultBaseUrl = "http://localhost:3000"

export type LineaWorkspaceClientOptions = {
  workspaceKey: WorkspaceKey
  baseUrl?: string
}

export class LineaWorkspaceClient extends LineaClient {
  private readonly serverTransport: ServerTransport

  constructor(options: LineaWorkspaceClientOptions) {
    const baseUrl = options.baseUrl ?? defaultBaseUrl
    super({ apiKey: options.workspaceKey.value, baseUrl })
    this.serverTransport = new ServerTransport(
      baseUrl,
      options.workspaceKey.value
    )
  }

  listRegressionCases(
    workflowId: string,
    query: ListRegressionCases = {}
  ): Promise<RegressionCase[]> {
    return this.serverTransport.execute(listRegressionCasesOperation, {
      path: { workflowId },
      query: {
        includeArchived:
          query.includeArchived === undefined
            ? undefined
            : String(query.includeArchived),
      },
    })
  }

  createRegressionCaseFromStep(
    workflowId: string,
    input: CreateRegressionCaseFromStep
  ): Promise<RegressionCase> {
    return this.serverTransport.execute(createRegressionCaseFromStepOperation, {
      path: { workflowId },
      body: input,
    })
  }

  createRegressionCaseFromFlag(
    workflowId: string,
    input: CreateRegressionCaseFromFlag
  ): Promise<RegressionCase> {
    return this.serverTransport.execute(createRegressionCaseFromFlagOperation, {
      path: { workflowId },
      body: input,
    })
  }

  archiveRegressionCase(
    workflowId: string,
    regressionCaseId: string
  ): Promise<RegressionCase> {
    return this.serverTransport.execute(archiveRegressionCaseOperation, {
      path: { workflowId, id: regressionCaseId },
    })
  }

  listRegressionRuns(
    workflowId: string,
    query: ListRegressionRuns = {}
  ): Promise<RegressionRun[]> {
    return this.serverTransport.execute(listRegressionRunsOperation, {
      path: { workflowId },
      query,
    })
  }

  triggerRegressionRun(
    workflowId: string,
    input: TriggerRegressionRun = {}
  ): Promise<{ queued: true }> {
    return this.serverTransport.execute(triggerRegressionRunOperation, {
      path: { workflowId },
      body: input,
    })
  }

  getRegressionRun(
    workflowId: string,
    regressionRunId: string
  ): Promise<RegressionRunDetail> {
    return this.serverTransport.execute(getRegressionRunOperation, {
      path: { workflowId, id: regressionRunId },
    })
  }
}

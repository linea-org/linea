import {
  getRegressionRunOperation,
  listRegressionCasesOperation,
  listRegressionRunsOperation,
} from "@linealabs/protocol/operations"
import type {
  ListRegressionCases,
  ListRegressionRuns,
  RegressionCase,
  RegressionRun,
  RegressionRunDetail,
} from "@linealabs/protocol/resources"
import type { ServerTransport } from "../server/transport.js"

export class Regressions {
  constructor(private readonly transport: ServerTransport) {}

  listCases(
    workflowId: string,
    query: ListRegressionCases = {}
  ): Promise<RegressionCase[]> {
    return this.transport.execute(listRegressionCasesOperation, {
      path: { workflowId },
      query: {
        includeArchived:
          query.includeArchived === undefined
            ? undefined
            : String(query.includeArchived),
      },
    })
  }

  listRuns(
    workflowId: string,
    query: ListRegressionRuns = {}
  ): Promise<RegressionRun[]> {
    return this.transport.execute(listRegressionRunsOperation, {
      path: { workflowId },
      query,
    })
  }

  getRun(
    workflowId: string,
    regressionRunId: string
  ): Promise<RegressionRunDetail> {
    return this.transport.execute(getRegressionRunOperation, {
      path: { workflowId, id: regressionRunId },
    })
  }
}

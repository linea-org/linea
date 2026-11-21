import type {
  CountNewExecutionsParams,
  Execution,
  ExecutionDetail,
  ListExecutionsParams,
  WorkspaceExecutionPage,
} from "../types/index.js"
import { waitUntilFinished, type WaitOptions } from "../wait-until-finished.js"
import { path, type WorkspaceRequest } from "./workspace-request.js"

export class Executions {
  constructor(private readonly send: WorkspaceRequest) {}

  get(executionId: string): Promise<ExecutionDetail> {
    return this.send({
      method: "GET",
      path: path`/workspace/executions/${executionId}`,
    })
  }

  /** Cursor-paginated, newest first unless `sort` is given. Pass a page's `nextCursor` as the next `cursor`, with the same `sort`. */
  list(params: ListExecutionsParams = {}): Promise<WorkspaceExecutionPage> {
    return this.send({
      method: "GET",
      path: "/executions",
      query: {
        status: params.status,
        trigger: params.trigger,
        sort: params.sort,
        cursor: params.cursor,
      },
    })
  }

  /** The workflow's 50 newest executions; the server does not paginate further. */
  listForWorkflow(workflowId: string): Promise<Execution[]> {
    return this.send({
      method: "GET",
      path: path`/workflows/${workflowId}/executions`,
    })
  }

  countNew(params: CountNewExecutionsParams): Promise<number> {
    return this.send({
      method: "GET",
      path: "/executions/new-count",
      query: {
        since: params.since,
        status: params.status,
        trigger: params.trigger,
      },
    })
  }

  wait(
    executionId: string,
    options: WaitOptions = {}
  ): Promise<ExecutionDetail> {
    return waitUntilFinished(
      executionId,
      () => this.get(executionId),
      (detail) => detail.execution.status,
      options
    )
  }
}

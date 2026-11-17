import type { Execution } from "../types/execution.js"
import type {
  CreateWorkflowInput,
  CreateWorkflowVersionInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowVersion,
} from "../types/workflow.js"
import { path, type WorkspaceRequest } from "./workspace-request.js"

export class Workflows {
  constructor(private readonly send: WorkspaceRequest) {}

  list(): Promise<Workflow[]> {
    return this.send({ method: "GET", path: "/workflows" })
  }

  get(workflowId: string): Promise<Workflow> {
    return this.send({ method: "GET", path: path`/workflows/${workflowId}` })
  }

  create(input: CreateWorkflowInput): Promise<Workflow> {
    return this.send({ method: "POST", path: "/workflows", body: input })
  }

  update(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow> {
    return this.send({
      method: "PATCH",
      path: path`/workflows/${workflowId}`,
      body: input,
    })
  }

  archive(workflowId: string): Promise<Workflow> {
    return this.send({
      method: "PATCH",
      path: path`/workflows/${workflowId}`,
      body: { archived: true },
    })
  }

  /** Saves the unpublished working copy the builder opens, which may be incomplete; runs keep
   * using the published version. */
  saveDraft(
    workflowId: string,
    graph: Record<string, unknown>
  ): Promise<Workflow> {
    return this.send({
      method: "PUT",
      path: path`/workflows/${workflowId}/draft`,
      body: { graph },
    })
  }

  createVersion(
    workflowId: string,
    input: CreateWorkflowVersionInput
  ): Promise<WorkflowVersion> {
    return this.send({
      method: "POST",
      path: path`/workflows/${workflowId}/versions`,
      body: input,
    })
  }

  listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    return this.send({
      method: "GET",
      path: path`/workflows/${workflowId}/versions`,
    })
  }

  getVersion(workflowId: string, versionId: string): Promise<WorkflowVersion> {
    return this.send({
      method: "GET",
      path: path`/workflows/${workflowId}/versions/${versionId}`,
    })
  }

  /** Starts the version published to the dev Environment. Production starts need an Environment key
   * and `LineaEnvironmentClient`. */
  run(workflowId: string, options: RunWorkflowInput = {}): Promise<Execution> {
    return this.send({
      method: "POST",
      path: path`/workflows/${workflowId}/executions`,
      body: {
        triggerPayload: options.input,
        externalSubjectId: options.externalSubjectId,
      },
    })
  }
}

export type WorkflowNodeType =
  | "start"
  | "end"
  | "http"
  | "connector"
  | "transform"
  | "branch"
  | "ai"
  | "agent"
  | "extract"
  | "evaluator"
  | "approval"
  | "memory"
  | "wait"
  | "datetime"
  | "filter"
  | "merge"
  | "variables"

export type WorkflowNode = {
  id: string
  type: WorkflowNodeType
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

export type WorkflowEdge = {
  from: string
  to: string
  condition?: string
}

export type WorkflowTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string; timezone: string }
  | { type: "webhook" }
  | { type: "api" }

export type WorkflowGraph = {
  version: 1
  trigger: WorkflowTrigger
  entryNodeId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type Workflow = {
  id: string
  workspaceId: string
  applicationId: string
  name: string
  slug: string
  description: string | null
  publishedVersionId: string | null
  draftGraph: Record<string, unknown> | null
  draftUpdatedAt: string | null
  archivedAt: string | null
  scratch: boolean
  createdAt: string
  updatedAt: string
}

export type WorkflowVersion = {
  id: string
  workflowId: string
  version: number
  graph: WorkflowGraph
  contentHash: string
  workflowContractRevisionId: string | null
  message: string | null
  publishedAt: string | null
  createdAt: string
}

export type CreateWorkflowInput = {
  applicationId: string
  name: string
  slug: string
  description?: string
  graph?: WorkflowGraph
}

export type UpdateWorkflowInput = {
  name?: string
  slug?: string
  description?: string
}

export type CreateWorkflowVersionInput = {
  graph: WorkflowGraph
  message?: string
  workflowContractRevisionId?: string
}

export type RunWorkflowInput = {
  input?: Record<string, unknown>
  externalSubjectId?: string
}

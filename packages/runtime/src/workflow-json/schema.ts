import { z } from "zod"

export const nodeTypeSchema = z.enum([
  "start",
  "end",
  "http",
  "transform",
  "branch",
  "ai",
  "approval",
  "memory",
])
export type NodeType = z.infer<typeof nodeTypeSchema>

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  // Canvas layout only — absent graphs get auto-laid-out on first open.
  position: z.object({ x: z.number(), y: z.number() }).optional(),
})
export type WorkflowNode = z.infer<typeof workflowNodeSchema>

export const workflowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  // Set on edges out of a branch node — matched against the node's output.
  condition: z.string().optional(),
})
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>

export const workflowTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({
    type: z.literal("schedule"),
    cron: z.string(),
    timezone: z.string(),
  }),
  z.object({ type: z.literal("webhook") }),
  z.object({ type: z.literal("api") }),
])
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>

export const workflowGraphSchema = z.object({
  version: z.literal(1),
  trigger: workflowTriggerSchema,
  entryNodeId: z.string().min(1),
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
})
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>

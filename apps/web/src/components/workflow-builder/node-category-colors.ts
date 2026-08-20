import type { NodeUICategory } from "@linea/runtime/browser"
import { nodeRegistry, type NodeTypeId } from "@linea/runtime/browser"

// "ai" reuses the existing --primary token instead of adding a new one.
export const NODE_CATEGORY_COLORS: Record<
  NodeUICategory,
  { icon: string; bg: string; badge: string; port: string; stroke: string }
> = {
  ai: {
    icon: "text-primary",
    bg: "bg-primary/10",
    badge: "bg-primary text-primary-foreground",
    port: "!bg-primary",
    stroke: "var(--primary)",
  },
  integration: {
    icon: "text-node-integration",
    bg: "bg-node-integration-bg",
    badge: "bg-node-integration text-primary-foreground",
    port: "!bg-node-integration",
    stroke: "var(--node-integration)",
  },
  logic: {
    icon: "text-node-logic",
    bg: "bg-node-logic-bg",
    badge: "bg-node-logic text-primary-foreground",
    port: "!bg-node-logic",
    stroke: "var(--node-logic)",
  },
  data: {
    icon: "text-node-data",
    bg: "bg-node-data-bg",
    badge: "bg-node-data text-primary-foreground",
    port: "!bg-node-data",
    stroke: "var(--node-data)",
  },
  trigger: {
    icon: "text-node-trigger",
    bg: "bg-node-trigger-bg",
    badge: "bg-node-trigger text-primary-foreground",
    port: "!bg-node-trigger",
    stroke: "var(--node-trigger)",
  },
}

export const NODE_CATEGORY_LABELS: Record<NodeUICategory, string> = {
  trigger: "Triggers",
  ai: "Agents",
  integration: "Integration",
  logic: "Logic",
  data: "Data",
}

function isNodeTypeId(value: string): value is NodeTypeId {
  return value in nodeRegistry
}

export function categoryStroke(nodeType: string | undefined): string {
  if (!nodeType || !isNodeTypeId(nodeType)) {
    return "var(--muted-foreground)"
  }
  return NODE_CATEGORY_COLORS[nodeRegistry[nodeType].ui.category].stroke
}

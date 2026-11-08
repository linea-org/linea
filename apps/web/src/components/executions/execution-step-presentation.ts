import { nodeRegistry, type NodeTypeId } from "@linea/runtime/browser"
import type { ExecutionStepSummary } from "@/lib/executions-api"

export const stepStatusLabel: Record<ExecutionStepSummary["status"], string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
}

export const stepStatusVariant: Record<
  ExecutionStepSummary["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  skipped: "outline",
}

export function isNodeTypeId(value: string): value is NodeTypeId {
  return Object.hasOwn(nodeRegistry, value)
}

export function stepTitle(name: string): string {
  if (!isNodeTypeId(name)) return name
  return nodeRegistry[name].ui.label
}

export function formatJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

import type { Edge, Node } from "@xyflow/react"
import {
  nodeRegistry,
  readPath,
  stepsBefore,
  type NodeTypeId,
} from "@linealabs/runtime/browser"
import { z } from "zod"

import type { WorkflowBuilderNodeData } from "./graph-conversion"

export type ReferenceGroup = {
  id: string
  heading: string
  items: { label: string; text: string }[]
}

type BuilderNode = Pick<Node<WorkflowBuilderNodeData>, "id" | "data">

function keysOf(value: unknown): string[] {
  return value !== null && typeof value === "object" ? Object.keys(value) : []
}

// The reference syntax has no way to write a key that contains a quote or a brace.
function toPath(...keys: string[]): string | undefined {
  if (keys.some((key) => /["{}]/.test(key))) return undefined
  return keys
    .map((key) => (/^[\w-]+$/.test(key) ? `.${key}` : `["${key}"]`))
    .join("")
}

function outputKeys(nodeType: NodeTypeId): string[] {
  const { outputSchema } = nodeRegistry[nodeType]
  return outputSchema instanceof z.ZodObject
    ? Object.keys(outputSchema.shape).filter((key) => !key.startsWith("tokens"))
    : []
}

function outputPaths({ nodeType, config }: BuilderNode["data"]): string[][] {
  const paths = outputKeys(nodeType).map((key) => [key])
  if (nodeType !== "extract") return paths
  const properties = readPath(config.schema, ["properties"])
  return [...paths, ...keysOf(properties).map((key) => ["data", key])]
}

function toItems(
  root: string,
  paths: string[][]
): { label: string; text: string }[] {
  return paths.flatMap((path) => {
    const suffix = toPath(...path)
    return suffix === undefined
      ? []
      : [{ label: path.join("."), text: root + suffix }]
  })
}

function nodeTitle({ data }: BuilderNode): string {
  const name = data.config.name
  return typeof name === "string" && name.trim()
    ? name.trim()
    : nodeRegistry[data.nodeType].ui.label
}

/** What a step can refer to, nearest step first; secrets are listed separately. */
export function referenceGroups(
  nodes: BuilderNode[],
  edges: Pick<Edge, "source" | "target">[],
  nodeId: string
): ReferenceGroup[] {
  const before = stepsBefore(
    {
      edges: edges.map(({ source, target }) => ({ from: source, to: target })),
    },
    nodeId
  )
  const steps = [...before].flatMap(
    (id) => nodes.find((node) => node.id === id) ?? []
  )
  const titles = steps.map(nodeTitle)
  const stepGroups = steps.flatMap((step, index): ReferenceGroup[] => {
    const path = toPath(step.id)
    if (path === undefined) return []
    const root = `steps${path}`
    const isUnique =
      titles.filter((title) => title === titles[index]).length < 2
    return [
      {
        id: step.id,
        heading: isUnique ? titles[index] : `${titles[index]} (${step.id})`,
        items: [
          { label: "Whole output", text: root },
          ...toItems(root, outputPaths(step.data)),
        ],
      },
    ]
  })
  const variables = new Set(
    steps.flatMap(({ data: { nodeType, config } }) =>
      nodeType === "variables" && config.operation === "set"
        ? keysOf(config.entries)
        : []
    )
  )
  return [
    {
      id: "input",
      heading: "Input",
      items: [{ label: "Whole input", text: "input" }],
    },
    ...stepGroups,
    {
      id: "variables",
      heading: "Workflow variables",
      items: toItems(
        "variables",
        [...variables].map((key) => [key])
      ),
    },
  ].filter(({ items }) => items.length > 0)
}

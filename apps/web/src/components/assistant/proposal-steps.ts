import { nodeRegistry } from "@linealabs/runtime/browser"

import type { Proposal } from "./proposal"

type Graph = Proposal["graph"]

export type ProposalStep = ReturnType<typeof describeStep>

function describeStep(node: Graph["nodes"][number]) {
  const { ui } = nodeRegistry[node.type]
  const customName =
    typeof node.config.name === "string" ? node.config.name.trim() : ""
  const raw = ui.summaryField ? node.config[ui.summaryField] : undefined
  const value =
    typeof raw === "string" || typeof raw === "number" ? String(raw) : undefined
  const option = ui.fields
    .find((field) => field.key === ui.summaryField)
    ?.options?.find((item) => item.value === value)
  return {
    id: node.id,
    title: customName || ui.label,
    icon: ui.icon,
    category: ui.category,
    detail: option?.label ?? value,
  }
}

/** Nodes in the order they run, one branch after another; any that cannot run come last. */
function inRunOrder(graph: Graph): Graph["nodes"] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const ordered = new Set<Graph["nodes"][number]>()
  const waiting = [graph.entryNodeId]
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    const node = byId.get(id)
    if (!node || ordered.has(node)) continue
    ordered.add(node)
    const next = graph.edges.filter((edge) => edge.from === id)
    waiting.push(...next.map((edge) => edge.to).reverse())
  }
  for (const node of graph.nodes) ordered.add(node)
  return [...ordered]
}

/** Every step, whether it leads to the one listed after it, and any other place it goes. */
export function proposalSteps(graph: Graph) {
  const steps = inRunOrder(graph).map(describeStep)
  const titles = new Map(steps.map((step) => [step.id, step.title]))
  return steps.map((step, index) => {
    const after = steps.at(index + 1)?.id
    const next = graph.edges.filter((edge) => edge.from === step.id)
    const leadsOn = next.some((edge) => edge.to === after)
    const routes = next.map((edge) => ({
      when: edge.condition,
      to: titles.get(edge.to) ?? edge.to,
    }))
    const oneWayOn = routes.length === 1 && leadsOn
    return { ...step, leadsOn, routes: oneWayOn ? [] : routes }
  })
}

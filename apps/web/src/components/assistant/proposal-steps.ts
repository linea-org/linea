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

/** Every step, with where it goes next when it goes to more than one place. */
export function proposalSteps(graph: Graph) {
  const steps = graph.nodes.map(describeStep)
  const titles = new Map(steps.map((step) => [step.id, step.title]))
  return steps.map((step) => {
    const next = graph.edges.filter((edge) => edge.from === step.id)
    const routes = next.map((edge) => ({
      when: edge.condition,
      to: titles.get(edge.to) ?? edge.to,
    }))
    return { ...step, routes: routes.length > 1 ? routes : [] }
  })
}

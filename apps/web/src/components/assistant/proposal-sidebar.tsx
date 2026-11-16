import { useState, type ReactNode } from "react"
import { Maximize2Icon, XIcon } from "lucide-react"

import { nodeRegistry } from "@linea/runtime/browser"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import { Dialog, DialogContent, DialogTitle } from "@linea/ui/components/dialog"
import { ScrollArea } from "@linea/ui/components/scroll-area"

import { WorkflowPreview } from "./workflow-preview"
import type { Proposal } from "./proposal"

type Step = Proposal["graph"]["nodes"][number]

function describeStep(node: Step) {
  const definition = nodeRegistry[node.type]
  const customName =
    typeof node.config.name === "string" ? node.config.name.trim() : ""
  const field = definition.ui.summaryField
  const raw = field ? node.config[field] : undefined
  const detail =
    typeof raw === "string" || typeof raw === "number" ? String(raw) : undefined
  return {
    title: customName || definition.ui.label,
    label: definition.ui.label,
    category: definition.ui.category,
    detail,
  }
}

export function ProposalSidebar({
  proposal,
  actions,
  onClose,
}: {
  proposal: Proposal
  actions: ReactNode
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const steps = proposal.graph.nodes.map(describeStep)
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <p className="min-w-0 truncate text-base font-medium">
          {proposal.title ?? "Proposed workflow"}
        </p>
        <span className="shrink-0 text-sm text-muted-foreground">
          {steps.length} steps
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close details"
        >
          <XIcon />
        </Button>
      </div>
      <div className="relative h-72 shrink-0 border-b border-border">
        <WorkflowPreview graph={proposal.graph} view="fit" />
        <Button
          type="button"
          variant="secondary"
          className="absolute top-2 right-2"
          onClick={() => setExpanded(true)}
        >
          <Maximize2Icon />
          Expand
        </Button>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-4/5 max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogTitle className="border-b border-border px-4 py-3 text-base font-medium">
            {proposal.title ?? "Proposed workflow"}
          </DialogTitle>
          <div className="min-h-0 flex-1">
            <WorkflowPreview graph={proposal.graph} view="explore" />
          </div>
        </DialogContent>
      </Dialog>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-1 p-3">
          {steps.map((step, index) => (
            <li
              key={proposal.graph.nodes[index].id}
              className="flex items-start gap-3 rounded-lg px-2 py-2"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-sm text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{step.title}</p>
                {step.detail ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {step.detail}
                  </p>
                ) : null}
              </div>
              <Badge variant="secondary">{step.label}</Badge>
            </li>
          ))}
        </ol>
      </ScrollArea>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {actions}
      </div>
    </aside>
  )
}

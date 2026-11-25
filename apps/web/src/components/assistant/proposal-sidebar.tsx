import { useState, type ReactNode } from "react"
import { WorkflowIcon, XIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import { ScrollArea } from "@linealabs/ui/components/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"

import type { Proposal } from "./proposal"
import { ProposalStepList } from "./proposal-step-list"
import { WorkflowPreview } from "./workflow-preview"

export function ProposalSidebar({
  proposal,
  actions,
  onClose,
}: Readonly<{
  proposal: Proposal
  actions: ReactNode
  onClose: () => void
}>) {
  const [expanded, setExpanded] = useState(false)
  const title = proposal.title ?? "Proposed workflow"
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center gap-1 px-4">
        <p className="min-w-0 flex-1 truncate text-base font-medium">{title}</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setExpanded(true)}
                aria-label="Show graph"
              />
            }
          >
            <WorkflowIcon />
          </TooltipTrigger>
          <TooltipContent>Show graph</TooltipContent>
        </Tooltip>
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
      <ScrollArea className="min-h-0 flex-1">
        <ProposalStepList graph={proposal.graph} />
      </ScrollArea>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-4/5 max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogTitle className="border-b border-border px-4 py-3 text-base font-medium">
            {title}
          </DialogTitle>
          <div className="min-h-0 flex-1">
            <WorkflowPreview graph={proposal.graph} view="explore" />
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col gap-2 p-4">{actions}</div>
    </aside>
  )
}

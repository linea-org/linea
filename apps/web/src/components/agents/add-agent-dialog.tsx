import { useState, type ReactElement } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@linea/ui/components/dialog"

import { applicationsQueryOptions } from "@/lib/applications-api"
import { AgentOnboardingForm } from "./agent-onboarding-form"
import { ListSkeleton } from "@/components/workspace/list-skeleton"

export function AddAgentDialog({
  workspaceSlug,
  applicationId,
  trigger,
}: Readonly<{
  workspaceSlug: string
  applicationId?: string
  trigger: ReactElement
}>) {
  const [open, setOpen] = useState(false)
  const applications = useQuery({
    ...applicationsQueryOptions(workspaceSlug),
    enabled: open,
  })
  function applicationsContent() {
    if (applications.isPending) {
      return <ListSkeleton />
    }
    if (applications.isError) {
      return (
        <p className="text-sm text-destructive">{applications.error.message}</p>
      )
    }
    if (!applications.data) return null
    return (
      <AgentOnboardingForm
        key={applicationId ?? "new"}
        workspaceSlug={workspaceSlug}
        applications={applications.data}
        initialApplicationId={applicationId}
        plain
      />
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-4/5 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
        </DialogHeader>
        {applicationsContent()}
      </DialogContent>
    </Dialog>
  )
}

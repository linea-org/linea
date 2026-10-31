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

export function AddAgentDialog({
  workspaceSlug,
  applicationId,
  trigger,
}: {
  workspaceSlug: string
  applicationId?: string
  trigger: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const applications = useQuery({
    ...applicationsQueryOptions(workspaceSlug),
    enabled: open,
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
        </DialogHeader>
        {applications.isPending ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : applications.isError ? (
          <p className="text-xs text-destructive">
            {applications.error.message}
          </p>
        ) : applications.data ? (
          <AgentOnboardingForm
            key={applicationId ?? "new"}
            workspaceSlug={workspaceSlug}
            applications={applications.data}
            initialApplicationId={applicationId}
            plain
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

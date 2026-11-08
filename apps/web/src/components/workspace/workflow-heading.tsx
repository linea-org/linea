import { useEffect, useRef, useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { InfoIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"

import { WorkflowStatusBadge } from "@/components/workflows"
import { workflowQueryOptions, type WorkflowSummary } from "@/lib/workflows-api"

export function WorkflowHeading({
  slug,
  workflow: initialData,
}: Readonly<{
  slug: string
  workflow: WorkflowSummary
}>) {
  const { data: workflow } = useSuspenseQuery({
    ...workflowQueryOptions(slug, initialData.id),
    initialData,
  })
  const [slugNotice, setSlugNotice] = useState<string | null>(null)
  const slugNoticeTimeout = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (slugNoticeTimeout.current !== null) {
        window.clearTimeout(slugNoticeTimeout.current)
      }
    }
  }, [])
  function showSlugNotice(notice: string) {
    setSlugNotice(notice)
    if (slugNoticeTimeout.current !== null) {
      window.clearTimeout(slugNoticeTimeout.current)
    }
    slugNoticeTimeout.current = window.setTimeout(() => {
      setSlugNotice(null)
      slugNoticeTimeout.current = null
    }, 1200)
  }
  const updated = `Updated ${new Date(workflow.updatedAt).toLocaleString()}`
  return (
    <div className="flex min-w-0 items-center gap-2">
      <WorkflowStatusBadge
        workflow={workflow}
        className="h-4 px-2 text-[10px] leading-none"
      />
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="max-w-48 truncate text-sm font-medium text-foreground">
          {workflow.name}
        </h1>
        <button
          type="button"
          className="min-w-0 truncate rounded-sm font-mono text-[0.75rem] leading-none text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          title={workflow.slug}
          aria-label={slugNotice ?? "Copy slug"}
          onClick={() => {
            void navigator.clipboard.writeText(workflow.slug).then(
              () => showSlugNotice("Copied"),
              () => showSlugNotice("Could not copy")
            )
          }}
        >
          /{slugNotice ?? workflow.slug}
        </button>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            aria-label={
              workflow.description
                ? `${workflow.description} ${updated}`
                : updated
            }
            render={<Button type="button" variant="ghost" size="icon-xs" />}
          >
            <InfoIcon />
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="flex-col items-start gap-1 text-left"
          >
            {workflow.description ? <p>{workflow.description}</p> : null}
            <p
              className={
                workflow.description ? "text-background/70" : undefined
              }
            >
              {updated}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

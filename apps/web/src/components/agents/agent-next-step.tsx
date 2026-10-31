import { ArrowRightIcon } from "lucide-react"
import { Button } from "@linea/ui/components/button"

export function AgentNextStep({
  hasContract,
  hasVersion,
  hasPublishedVersion,
  tab,
  onContinue,
}: {
  hasContract: boolean
  hasVersion: boolean
  hasPublishedVersion: boolean
  tab: string
  onContinue: (tab: string) => void
}) {
  const steps = [
    {
      complete: hasContract,
      tab: "contracts",
      description:
        "Start with a Contract: define what your Agent receives and returns.",
      action: "Create Contract",
    },
    {
      complete: hasVersion,
      tab: "definition",
      description:
        "Write instructions and choose a model, then save your first version.",
      action: "Edit definition",
    },
    {
      complete: hasPublishedVersion,
      tab: "versions",
      description:
        "Review and publish a saved version to make it available for deployment.",
      action: "Review versions",
    },
    {
      complete: false,
      tab: "deployments",
      description: "Choose a published version for Development or Production.",
      action: "Manage deployments",
    },
  ]
  const step = steps.find((step) => !step.complete)
  if (!step) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{step.description}</p>
      {tab !== step.tab && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onContinue(step.tab)}
        >
          {step.action}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  )
}

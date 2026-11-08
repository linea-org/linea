import { InfoIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"

export function InfoTip({
  label,
  text,
}: Readonly<{ label: string; text: string }>) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={100}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={`About ${label}`}
            className="inline-flex size-5 cursor-help items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <InfoIcon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right">{text}</TooltipContent>
    </Tooltip>
  )
}

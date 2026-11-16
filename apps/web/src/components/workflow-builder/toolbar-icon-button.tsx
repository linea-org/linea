import type { ComponentProps } from "react"

import { Button } from "@linea/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"

/** An icon-only builder action; the label shows as a tooltip and names the button for screen readers. */
export function ToolbarIconButton({
  label,
  pressed,
  ...props
}: ComponentProps<typeof Button> & { label: string; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={pressed ? "secondary" : "ghost"}
            size="icon"
            aria-label={label}
            aria-pressed={pressed}
            {...props}
          />
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

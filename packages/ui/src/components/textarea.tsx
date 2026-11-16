import * as React from "react"

import { cn } from "@linea/ui/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-surface-canvas px-3 py-2 text-base transition outline-none placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

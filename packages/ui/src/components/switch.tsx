"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@linea/ui/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border-0 transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-1 focus-visible:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive data-[size=default]:h-5 data-[size=default]:w-7.5 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-checked:bg-primary data-checked:hover:bg-primary-hover data-unchecked:bg-input data-unchecked:hover:bg-border-strong data-disabled:cursor-not-allowed data-disabled:opacity-60",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:bg-primary-foreground group-data-[size=default]/switch:data-checked:translate-x-2.75 group-data-[size=sm]/switch:data-checked:translate-x-2.5 data-unchecked:bg-background group-data-[size=default]/switch:data-unchecked:translate-x-0.75 group-data-[size=sm]/switch:data-unchecked:translate-x-0.5 dark:data-unchecked:bg-surface-canvas"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

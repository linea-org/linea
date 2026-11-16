import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@linea/ui/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition outline-none select-none focus-visible:ring-1 focus-visible:ring-ring active:not-aria-[haspopup]:scale-98 disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        outline:
          "border-input bg-transparent text-foreground/85 shadow-xs hover:border-border-strong hover:bg-accent hover:text-foreground focus-visible:border-border-strong aria-expanded:border-border-strong aria-expanded:bg-accent aria-expanded:text-foreground",
        secondary:
          "border-input bg-secondary text-secondary-foreground shadow-xs hover:border-border-strong hover:bg-secondary-hover focus-visible:border-border-strong aria-expanded:border-border-strong aria-expanded:bg-secondary-hover",
        ghost:
          "text-foreground/80 hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover focus-visible:shadow-lg focus-visible:ring-0 focus-visible:shadow-destructive/50",
        link: "text-primary hover:text-foreground focus-visible:ring-0 active:not-aria-[haspopup]:scale-100",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-9 gap-2 px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 px-0",
        "icon-xs":
          "size-7 rounded-md px-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md px-0",
        "icon-lg": "size-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }

import { Skeleton } from "@linealabs/ui/components/skeleton"
import { cn } from "@linealabs/ui/lib/utils"

export function ListSkeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <output
      aria-label="Loading"
      className={cn("flex flex-col gap-2", className)}
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </output>
  )
}

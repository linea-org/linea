import { Skeleton } from "@linea/ui/components/skeleton"
import { cn } from "@linea/ui/lib/utils"

export function ListSkeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex flex-col gap-2", className)}
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

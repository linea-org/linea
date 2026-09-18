"use client"

import { ArrowUp } from "lucide-react"

export function TocPlate() {
  return (
    <div className="mt-auto flex justify-center pt-6 pb-2">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="border-fd-border bg-fd-card text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-accent inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
      >
        <ArrowUp className="size-3" />
        Back to top
      </button>
    </div>
  )
}

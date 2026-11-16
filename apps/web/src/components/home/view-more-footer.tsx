import type { ReactElement } from "react"

import { Button } from "@linea/ui/components/button"

export function ViewMoreFooter({
  hidden,
  link,
}: Readonly<{ hidden: number; link: ReactElement }>) {
  if (hidden <= 0) return null
  return (
    <div className="mt-auto border-t px-2 py-1">
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        nativeButton={false}
        render={link}
      >
        View {hidden} more
      </Button>
    </div>
  )
}

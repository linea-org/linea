import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"

/** The id is for support and debugging, so it stays small and one click from the clipboard. */
export function CopyableId({ id }: Readonly<{ id: string }>) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="-ml-2 h-6 max-w-full font-mono text-xs text-muted-foreground"
      aria-label={`Copy run ID ${id}`}
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      <span title={id}>{id.slice(0, 8)}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

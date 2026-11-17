import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"

export function CopyButton({
  text,
  label,
  size = "icon-sm",
}: Readonly<{ text: string; label: string; size?: "icon-xs" | "icon-sm" }>) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

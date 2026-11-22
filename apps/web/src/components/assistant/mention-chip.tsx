import { XIcon } from "lucide-react"

import { Badge } from "@linealabs/ui/components/badge"
import { Button } from "@linealabs/ui/components/button"

import { KIND_META } from "./mention-kinds"
import type { MentionKind } from "./mention-text"

export function MentionChip({
  kind,
  label,
  onRemove,
}: Readonly<{ kind: MentionKind; label: string; onRemove: () => void }>) {
  const { Icon } = KIND_META[kind]
  return (
    <Badge variant="info" className="pr-0.5 select-none">
      <Icon />
      <span className="max-w-40 truncate">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        aria-label={`Remove ${label}`}
        className="size-4 rounded-full"
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </Button>
    </Badge>
  )
}

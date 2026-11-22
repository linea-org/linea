import { LayoutGridIcon, PlayIcon, WorkflowIcon } from "lucide-react"

import type { MentionKind } from "./mention-text"

export const KIND_META = {
  run: { heading: "Runs", Icon: PlayIcon },
  workflow: { heading: "Workflows", Icon: WorkflowIcon },
  application: { heading: "Applications", Icon: LayoutGridIcon },
} satisfies Record<MentionKind, unknown>

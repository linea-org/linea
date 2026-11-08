import { z } from "zod"
import { sidebarTrailSchema, type Trail } from "./sidebar-history"

const browserStateSchema = z
  .object({
    lineaSidebar: z
      .object({
        slug: z.string(),
        trail: sidebarTrailSchema,
        expanded: z.record(z.string(), z.boolean()).default({}),
      })
      .optional(),
  })
  .nullable()

export function readSidebarBrowserState() {
  return browserStateSchema.parse(window.history.state)?.lineaSidebar
}

export function writeSidebarBrowserState(
  slug: string,
  trail: Trail,
  expanded: Record<string, boolean>
) {
  const state = z
    .record(z.string(), z.unknown())
    .nullable()
    .parse(window.history.state)
  window.history.replaceState(
    { ...state, lineaSidebar: { slug, trail, expanded } },
    ""
  )
}

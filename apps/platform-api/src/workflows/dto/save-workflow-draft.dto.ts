import { z } from 'zod'

// Deliberately not workflowGraphSchema — a draft is a frequent, unvalidated
// working copy and can be structurally incomplete mid-edit.
export const saveWorkflowDraftSchema = z.object({
  graph: z.record(z.string(), z.unknown()),
})

export type SaveWorkflowDraftDto = z.infer<typeof saveWorkflowDraftSchema>

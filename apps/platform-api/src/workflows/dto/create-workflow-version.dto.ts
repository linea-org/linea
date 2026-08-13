import { z } from 'zod'
import { workflowGraphSchema } from '@linea/runtime'

export const createWorkflowVersionSchema = z.object({
  graph: workflowGraphSchema,
  message: z.string().max(500).optional(),
})

export type CreateWorkflowVersionDto = z.infer<
  typeof createWorkflowVersionSchema
>

import { z } from 'zod'
import { workflowGraphSchema } from '@linea/runtime'

export const createWorkflowVersionSchema = z.object({
  graph: workflowGraphSchema,
})

export type CreateWorkflowVersionDto = z.infer<
  typeof createWorkflowVersionSchema
>

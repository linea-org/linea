import { z } from 'zod'
import { workflowGraphSchema } from '@linea/runtime'

export const testRunSchema = z.object({
  graph: workflowGraphSchema,
})

export type TestRunDto = z.infer<typeof testRunSchema>

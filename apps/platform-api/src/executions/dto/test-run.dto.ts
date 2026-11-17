import { z } from 'zod'
import { workflowGraphSchema } from '@linealabs/runtime'

export const testRunSchema = z.object({
  graph: workflowGraphSchema,
})

export type TestRunDto = z.infer<typeof testRunSchema>

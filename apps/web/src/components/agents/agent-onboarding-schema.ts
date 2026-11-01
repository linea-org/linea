import { z } from "zod"
import { createAgentInputSchema } from "@/lib/agent-schemas"
import { createApplicationInputSchema } from "@/lib/applications-api"

export const agentOnboardingSchema = createAgentInputSchema
  .omit({ applicationId: true })
  .extend({
    application: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("existing"),
        id: z.uuid("Choose an Application"),
      }),
      createApplicationInputSchema.extend({ kind: z.literal("new") }),
    ]),
  })

export type AgentOnboardingInput = z.infer<typeof agentOnboardingSchema>

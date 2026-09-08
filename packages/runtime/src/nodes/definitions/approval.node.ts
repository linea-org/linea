import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const approvalInputSchema = z.unknown()

const approvalOutputSchema = z.object({
  approved: z.boolean(),
  comment: z.string().nullable(),
  respondedBy: z.string().nullable(),
  respondedAt: z.string().nullable(),
  timedOut: z.boolean(),
})

export const approvalNode: NodeDefinition<
  z.infer<typeof approvalInputSchema>,
  z.infer<typeof approvalOutputSchema>
> = {
  id: "approval",
  inputSchema: approvalInputSchema,
  outputSchema: approvalOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Approval",
    description:
      "Pause and wait for a human to approve or reject before continuing. Wire a Branch node after it to route differently on approved vs. rejected.",
    category: "logic",
    icon: "user-check",
    fields: [
      {
        key: "message",
        label: "Message",
        widget: "textarea",
        description: "Shown to whoever reviews this approval.",
      },
      {
        key: "approverEmails",
        label: "Approvers",
        widget: "text",
        description:
          "Comma-separated workspace member emails. Leave empty to let any workspace member respond.",
      },
      {
        key: "timeoutMinutes",
        label: "Timeout (minutes)",
        widget: "text",
        description: "Leave empty to wait indefinitely.",
      },
      {
        key: "timeoutAction",
        label: "On timeout",
        widget: "select",
        description: "Only used if a timeout is set above.",
        options: [
          { label: "Auto-reject", value: "auto_reject" },
          { label: "Auto-approve", value: "auto_approve" },
        ],
      },
    ],
    summaryField: "message",
  },
}

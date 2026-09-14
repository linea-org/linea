import { describe, expect, it } from "vitest"
import { approvalNode } from "./approval.node.js"

describe("approvalNode", () => {
  it("exposes the two accepted audiences without a subject path", () => {
    const fields = Object.fromEntries(
      approvalNode.ui.fields.map((field) => [field.key, field])
    )
    expect(fields.approverEmails).toMatchObject({ widget: "text" })
    expect(fields.audience).toMatchObject({
      widget: "select",
      options: [
        { label: "Workspace members", value: "workspace" },
        { label: "End user", value: "external_subject" },
      ],
    })
    expect(fields.subjectPath).toBeUndefined()
  })
})

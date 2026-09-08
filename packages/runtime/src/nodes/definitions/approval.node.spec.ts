import { describe, expect, it } from "vitest"
import { approvalNode } from "./approval.node.js"

describe("approvalNode", () => {
  it("exposes workspace approver configuration only", () => {
    const fields = Object.fromEntries(
      approvalNode.ui.fields.map((field) => [field.key, field])
    )
    expect(fields.approverEmails).toMatchObject({ widget: "text" })
    expect(fields.audience).toBeUndefined()
    expect(fields.subjectPath).toBeUndefined()
  })
})

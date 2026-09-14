import { describe, expect, it } from "vitest"
import { approvalNode } from "./approval.node.js"

describe("approvalNode", () => {
  it("keeps external-subject configuration hidden until it can resolve", () => {
    const fields = Object.fromEntries(
      approvalNode.ui.fields.map((field) => [field.key, field])
    )
    expect(fields.approverEmails).toMatchObject({ widget: "text" })
    expect(fields.audience).toBeUndefined()
    expect(fields.subjectPath).toBeUndefined()
  })
})

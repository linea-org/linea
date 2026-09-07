import { describe, expect, it } from "vitest"
import { approvalNode } from "./approval.node.js"

describe("approvalNode", () => {
  it("exposes audience-specific workspace and external-subject configuration", () => {
    const fields = Object.fromEntries(
      approvalNode.ui.fields.map((field) => [field.key, field])
    )
    expect(fields.audience).toMatchObject({
      widget: "select",
      options: [
        { label: "Workspace members", value: "workspace" },
        { label: "External subject", value: "external_subject" },
      ],
    })
    expect(fields.approverEmails.showIf).toEqual({
      key: "audience",
      equals: "workspace",
    })
    expect(fields.subjectPath.showIf).toEqual({
      key: "audience",
      equals: "external_subject",
    })
  })
})

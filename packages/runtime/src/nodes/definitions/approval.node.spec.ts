import { describe, expect, it } from "vitest"
import { approvalInputSchema, approvalNode } from "./approval.node.js"

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

describe("approval recipient configuration", () => {
  it("normalizes and deduplicates addresses without changing open workspace approvals", () => {
    expect(
      approvalInputSchema.parse({
        approverEmails: " Member@Example.com,member@example.com ",
      }).approverEmails
    ).toEqual(["member@example.com"])
    expect(approvalInputSchema.parse({}).approverEmails).toBeUndefined()
    expect(
      approvalInputSchema.parse({ approverEmails: " " }).approverEmails
    ).toEqual([])
  })
  it("allows twenty addresses and rejects invalid or oversized lists", () => {
    const emails = Array.from(
      { length: 20 },
      (_, i) => `member${i}@example.com`
    )
    expect(
      approvalInputSchema.safeParse({ approverEmails: emails.join(",") })
        .success
    ).toBe(true)
    for (const approverEmails of [
      42,
      "invalid",
      "a@example.com,",
      [...emails, "extra@example.com"].join(","),
      Array(21).fill("a@example.com").join(","),
    ]) {
      expect(approvalInputSchema.safeParse({ approverEmails }).success).toBe(
        false
      )
    }
  })
})

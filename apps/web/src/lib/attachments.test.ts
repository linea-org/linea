import { describe, expect, it } from "vitest"

import { attachmentProblem, MAX_ATTACHMENT_BYTES } from "./attachments"

const file = (name: string, type: string, size = 100) => ({ name, type, size })

describe("attachmentProblem", () => {
  it("accepts text by type", () => {
    expect(attachmentProblem(file("a.bin", "text/plain"), 0)).toBeNull()
    expect(attachmentProblem(file("a", "application/json"), 0)).toBeNull()
  })

  it("accepts text by extension when the browser gives no type", () => {
    expect(attachmentProblem(file("notes.md", ""), 0)).toBeNull()
    expect(attachmentProblem(file("data.CSV", ""), 0)).toBeNull()
  })

  it("refuses images and PDFs and says why", () => {
    expect(attachmentProblem(file("a.png", "image/png"), 0)).toMatch(
      /only text files/
    )
    expect(attachmentProblem(file("a.pdf", "application/pdf"), 0)).toMatch(
      /only text files/
    )
  })

  it("refuses a file that is too large", () => {
    expect(
      attachmentProblem(
        file("big.txt", "text/plain", MAX_ATTACHMENT_BYTES + 1),
        0
      )
    ).toMatch(/larger than/)
  })

  it("refuses a sixth file", () => {
    expect(attachmentProblem(file("a.txt", "text/plain"), 5)).toMatch(/up to 5/)
  })
})

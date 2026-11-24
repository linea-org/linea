import { describe, expect, it } from "vitest"

import {
  attachmentProblem,
  attachmentSummary,
  LONG_PASTE_CHARACTERS,
  MAX_ATTACHMENT_BYTES,
  pastedFile,
  readAttachments,
} from "./attachments"

const file = (name: string, type: string, size = 100) => ({ name, type, size })

describe("attachmentProblem", () => {
  it("accepts text by type", () => {
    expect(attachmentProblem(file("a.bin", "text/plain"), [])).toBeNull()
    expect(attachmentProblem(file("a", "application/json"), [])).toBeNull()
  })

  it("accepts text by extension when the browser gives no type", () => {
    expect(attachmentProblem(file("notes.md", ""), [])).toBeNull()
    expect(attachmentProblem(file("data.CSV", ""), [])).toBeNull()
  })

  it("refuses images and PDFs and says why", () => {
    expect(attachmentProblem(file("a.png", "image/png"), [])).toMatch(
      /Text files only/
    )
    expect(attachmentProblem(file("a.pdf", "application/pdf"), [])).toMatch(
      /Text files only/
    )
  })

  it("refuses a file that is too large", () => {
    expect(
      attachmentProblem(
        file("big.txt", "text/plain", MAX_ATTACHMENT_BYTES + 1),
        []
      )
    ).toMatch(/Over 100 KB/)
  })

  it("refuses a sixth file", () => {
    expect(
      attachmentProblem(
        file("a.txt", "text/plain"),
        Array.from({ length: 5 }, (_, index) => ({
          name: `${index}.txt`,
          content: "",
        }))
      )
    ).toMatch(/Up to 5/)
  })

  it("counts the files already attached against the size limit", () => {
    const attached = [{ name: "a.txt", content: "x".repeat(60_000) }]
    expect(
      attachmentProblem(file("b.txt", "text/plain", 60_000), attached)
    ).toMatch(/Over 100 KB/)
  })
})

describe("readAttachments", () => {
  it("keeps the good files and says why the others were refused", async () => {
    const result = await readAttachments(
      [
        new File(["a,b"], "a.csv", { type: "text/csv" }),
        new File(["x"], "a.png", { type: "image/png" }),
      ],
      []
    )
    expect(result.attachments).toEqual([{ name: "a.csv", content: "a,b" }])
    expect(result.rejected).toEqual([
      { name: "a.png", reason: "Text files only" },
    ])
  })

  it("refuses a file that cannot be read, such as a folder", async () => {
    const folder = new File([], "logs.txt", { type: "text/plain" })
    folder.text = () => Promise.reject(new Error("not found"))
    expect(await readAttachments([folder], [])).toEqual({
      attachments: [],
      rejected: [{ name: "logs.txt", reason: "Couldn't be read" }],
    })
  })

  it("gives a second file of the same name its own name", async () => {
    const { attachments } = await readAttachments(
      [new File(["2"], "notes.txt", { type: "text/plain" })],
      [{ name: "notes.txt", content: "1" }]
    )
    expect(attachments.map((item) => item.name)).toEqual([
      "notes.txt",
      "notes 2.txt",
    ])
  })
})

describe("pastedFile", () => {
  it("turns only a long paste into a file", async () => {
    expect(pastedFile("x".repeat(LONG_PASTE_CHARACTERS))).toBeNull()
    const pasted = pastedFile("y".repeat(LONG_PASTE_CHARACTERS + 1))
    expect(await pasted?.text()).toHaveLength(LONG_PASTE_CHARACTERS + 1)
  })
})

describe("attachmentSummary", () => {
  it("names the kind and counts the lines", () => {
    expect(attachmentSummary({ name: "a.csv", content: "a\nb" })).toBe(
      "CSV · 2 lines"
    )
    expect(attachmentSummary({ name: "README", content: "a" })).toBe("1 line")
  })
})

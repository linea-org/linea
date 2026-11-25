import { describe, expect, it, vi } from "vitest"

import {
  attachmentSummary,
  LONG_PASTE_CHARACTERS,
  MAX_ATTACHMENT_BYTES,
  pastedFile,
  readAttachments,
  type Attachment,
} from "./attachments"

const file = (name: string, type: string, content = "x") =>
  new File([content], name, { type })

async function refusal(added: File, attached: Attachment[] = []) {
  const { rejected } = await readAttachments([added], attached)
  return rejected.at(0)?.reason
}

describe("readAttachments", () => {
  it("accepts text by type, or by extension when there is no type", async () => {
    const { attachments, rejected } = await readAttachments(
      [
        file("a.bin", "text/plain"),
        file("a", "application/json"),
        file("notes.md", ""),
        file("data.CSV", ""),
      ],
      []
    )
    expect(attachments).toHaveLength(4)
    expect(rejected).toEqual([])
  })

  it("keeps the good files and says why the others were refused", async () => {
    const result = await readAttachments(
      [file("a.csv", "text/csv", "a,b"), file("a.png", "image/png")],
      []
    )
    expect(result.attachments).toEqual([{ name: "a.csv", content: "a,b" }])
    expect(result.rejected).toEqual([
      { name: "a.png", reason: "Text files only" },
    ])
  })

  it("refuses a sixth file", async () => {
    const attached = Array.from({ length: 5 }, (_, index) => ({
      name: `${index}.txt`,
      content: "",
    }))
    expect(await refusal(file("a.txt", "text/plain"), attached)).toBe(
      "Up to 5 files"
    )
  })

  it("does not read files past the limits", async () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      file(`${index}.txt`, "text/plain")
    )
    const read = vi.fn(() => Promise.resolve("x"))
    for (const each of many) each.text = read
    const { attachments, rejected } = await readAttachments(many, [])
    expect(attachments).toHaveLength(5)
    expect(rejected).toHaveLength(45)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it("counts the files already attached against the size limit", async () => {
    const attached = [{ name: "a.txt", content: "x".repeat(60_000) }]
    expect(
      await refusal(file("b.txt", "text/plain", "y".repeat(60_000)), attached)
    ).toBe("Over 100 KB in total")
  })

  it("counts text as it is sent, where a newline takes two bytes", async () => {
    const lines = "\n".repeat(MAX_ATTACHMENT_BYTES * 0.7)
    expect(await refusal(file("a.log", "text/plain", lines))).toBe(
      "Over 100 KB in total"
    )
  })

  it("gives a refused file's room to the next one", async () => {
    const { attachments } = await readAttachments(
      [
        file("lines.txt", "text/plain", "\n".repeat(70_000)),
        file("notes.txt", "text/plain", "y".repeat(40_000)),
      ],
      []
    )
    expect(attachments.map(({ name }) => name)).toEqual(["notes.txt"])
  })

  it("refuses a file that cannot be read, such as a folder", async () => {
    const folder = file("logs.txt", "text/plain")
    folder.text = () => Promise.reject(new Error("not found"))
    expect(await refusal(folder)).toBe("Couldn't be read")
  })

  it("gives a file of the same name its own name", async () => {
    const { attachments } = await readAttachments(
      [file("notes.txt", "text/plain"), file("notes.txt", "text/plain")],
      [{ name: "notes.txt", content: "1" }]
    )
    expect(attachments.map((item) => item.name)).toEqual([
      "notes.txt",
      "notes 2.txt",
      "notes 3.txt",
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

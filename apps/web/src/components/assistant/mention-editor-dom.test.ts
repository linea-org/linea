// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

import {
  caretAtEnd,
  chipHosts,
  chipNextToCaret,
  createChipHost,
  insertMentionAtTrigger,
  insertTextAtCaret,
  mentionTriggerAtCaret,
  removeChip,
  renderText,
  selectedMessageText,
  deleteSelection,
  serializeEditor,
} from "./mention-editor-dom"

const RUN_ID = "045f759c-1b2a-4c3d-8e4f-5a6b7c8d9e0f"
const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111"

let root: HTMLElement

function caretIn(node: Node, offset: number) {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement("div")
  document.body.append(root)
})

describe("the editor DOM", () => {
  it("renders references as chips and serializes them back unchanged", () => {
    const text = `why did @run:${RUN_ID} fail?\nand @workflow:${WORKFLOW_ID}`
    renderText(root, text)
    expect(chipHosts(root)).toHaveLength(2)
    expect(chipHosts(root)[0].dataset.label).toBe("run 045f759c")
    expect(chipHosts(root)[0].getAttribute("contenteditable")).toBe("false")
    expect(serializeEditor(root)).toBe(text)
  })

  it("reads line breaks and chips squeezed against text as clean tokens", () => {
    root.append("a", createChipHost({ kind: "run", id: RUN_ID }, "run"), "b")
    root.append(document.createElement("br"), "c")
    expect(serializeEditor(root)).toBe(`a @run:${RUN_ID} b\nc`)
  })

  it("ignores the placeholder BR a browser leaves on an empty last line", () => {
    root.append("hi ", document.createElement("br"))
    expect(serializeEditor(root)).toBe("hi ")
  })

  it("replaces the typed @query with a chip and puts the caret after it", () => {
    renderText(root, "see @wor now")
    const text = root.firstChild as Text
    caretIn(text, 8)
    const trigger = mentionTriggerAtCaret(root)
    expect(trigger).toMatchObject({ query: "wor", start: 4, end: 8 })
    insertMentionAtTrigger(
      root,
      trigger!,
      { kind: "workflow", id: WORKFLOW_ID },
      "Summarize tickets"
    )
    expect(chipHosts(root)[0].dataset.label).toBe("Summarize tickets")
    expect(serializeEditor(root)).toBe(`see @workflow:${WORKFLOW_ID} now`)
    expect(chipNextToCaret(root, "before")).toBe(chipHosts(root)[0])
  })

  it("finds no trigger away from a word start or outside a bare caret", () => {
    renderText(root, "bob@example")
    caretIn(root.firstChild!, 11)
    expect(mentionTriggerAtCaret(root)).toBeNull()
  })
})

describe("deleting a chip", () => {
  beforeEach(() => {
    renderText(root, `a @run:${RUN_ID}`)
  })

  it("finds the chip right before or after the caret, and nothing else", () => {
    const [chip] = chipHosts(root)
    caretAtEnd(root)
    expect(chipNextToCaret(root, "before")).toBe(chip)
    expect(chipNextToCaret(root, "after")).toBeNull()
    caretIn(root.firstChild!, 2)
    expect(chipNextToCaret(root, "after")).toBe(chip)
    caretIn(root.firstChild!, 1)
    expect(chipNextToCaret(root, "after")).toBeNull()
  })

  it("removes the whole chip and leaves the caret where it was", () => {
    const [chip] = chipHosts(root)
    caretAtEnd(root)
    removeChip(root, chip)
    expect(chipHosts(root)).toHaveLength(0)
    expect(serializeEditor(root)).toBe("a ")
    expect(document.getSelection()?.getRangeAt(0).collapsed).toBe(true)
  })
})

describe("pasting", () => {
  it("inserts text only, turning references in it into chips", () => {
    renderText(root, "x")
    caretAtEnd(root)
    insertTextAtCaret(root, `<b>bold</b> @run:${RUN_ID}`)
    expect(root.querySelector("b")).toBeNull()
    expect(chipHosts(root)).toHaveLength(1)
    expect(serializeEditor(root)).toBe(`x<b>bold</b> @run:${RUN_ID}`)
  })
})

describe("copying", () => {
  it("gives the reference text, not the chip label, for a selection with chips", () => {
    renderText(root, `see @run:${RUN_ID} now`)
    const range = document.createRange()
    range.selectNodeContents(root)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    expect(selectedMessageText(root)).toBe(`see @run:${RUN_ID} now`)
    deleteSelection(root)
    expect(serializeEditor(root)).toBe("")
  })

  it("gives nothing for a bare caret", () => {
    renderText(root, "hello")
    caretAtEnd(root)
    expect(selectedMessageText(root)).toBeNull()
  })
})

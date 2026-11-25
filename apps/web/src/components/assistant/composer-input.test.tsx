// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isEditableTarget } from "@/lib/shortcuts/engine"
import { useFlag } from "@/lib/use-flag"
import { ComposerInput } from "./composer-input"

const RUN_ID = "045f759c-1b2a-4c3d-8e4f-5a6b7c8d9e0f"

vi.mock("@/lib/use-flag", () => ({ useFlag: vi.fn() }))
vi.mock("./mention-picker", () => ({
  MentionPicker: () => <div data-testid="picker" />,
}))
const candidatesState = vi.hoisted(() => ({ loading: false }))
vi.mock("./use-mention-candidates", () => ({
  useMentionCandidates: () => ({
    candidates: candidatesState.loading
      ? []
      : [
          {
            kind: "run",
            id: "045f759c-1b2a-4c3d-8e4f-5a6b7c8d9e0f",
            label: "Summarize tickets",
            detail: "failed",
          },
        ],
    isLoading: candidatesState.loading,
    error: null,
  }),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const onChange = vi.fn<(value: string) => void>()
const onSendKey = vi.fn()
let container: HTMLElement
let root: Root

function Harness({ initial }: Readonly<{ initial: string }>) {
  const [value, setValue] = useState(initial)
  return (
    <ComposerInput
      label="Message Inky"
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
      onSendKey={onSendKey}
      placeholder="Ask anything"
      autoFocus={false}
    />
  )
}

function mount(initial: string) {
  act(() => root.render(<Harness initial={initial} />))
  return container.querySelector<HTMLElement>(
    "[data-slot=input-group-control]"
  )!
}

function caretAtEnd(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function press(element: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    element.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(useFlag).mockReturnValue(true)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe("ComposerInput", () => {
  it("renders the plain textarea when assistantMentions is off", () => {
    vi.mocked(useFlag).mockReturnValue(false)
    const field = mount("hello")
    expect(field.tagName).toBe("TEXTAREA")
    expect((field as HTMLTextAreaElement).value).toBe("hello")
    expect(container.querySelector("[contenteditable]")).toBeNull()
    expect(field.getAttribute("aria-label")).toBe("Message Inky")
  })

  it("renders the chip editor when it is on, as a labelled text box", () => {
    const field = mount("")
    expect(container.querySelector("textarea")).toBeNull()
    expect(field.getAttribute("contenteditable")).toBe("plaintext-only")
    expect(field.getAttribute("role")).toBe("textbox")
    expect(field.tabIndex).toBe(0)
    expect(field.getAttribute("aria-label")).toBe("Message Inky")
    expect(container.textContent).toContain("Ask anything")
    expect(isEditableTarget(field)).toBe(true)
  })

  it("shows a reference as a chip with a named remove button", () => {
    const field = mount(`hi @run:${RUN_ID}`)
    expect(field.textContent).toContain("run 045f759c")
    expect(field.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Remove run 045f759c"
    )
  })

  it("removes the chip when its X is clicked", () => {
    const field = mount(`hi @run:${RUN_ID}`)
    act(() => field.querySelector("button")?.click())
    expect(field.querySelector("button")).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith("hi ")
  })

  it("removes the whole chip on Backspace right after it", () => {
    const field = mount(`hi @run:${RUN_ID}`)
    caretAtEnd(field)
    const event = press(field, "Backspace")
    expect(event.defaultPrevented).toBe(true)
    expect(field.querySelector("button")).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith("hi ")
    expect(onSendKey).not.toHaveBeenCalled()
  })

  it("leaves Backspace alone when no chip is next to the caret", () => {
    const field = mount("hi there")
    caretAtEnd(field)
    expect(press(field, "Backspace").defaultPrevented).toBe(false)
  })

  it("pastes plain text only, dropping any HTML", () => {
    const field = mount("")
    caretAtEnd(field)
    const paste = new Event("paste", { bubbles: true, cancelable: true })
    Object.assign(paste, {
      clipboardData: {
        getData: (type: string) =>
          type === "text/plain" ? "plain text" : "<b>rich</b>",
      },
    })
    act(() => {
      field.dispatchEvent(paste)
    })
    expect(paste.defaultPrevented).toBe(true)
    expect(field.querySelector("b")).toBeNull()
    expect(field.textContent).toBe("plain text")
    expect(onChange).toHaveBeenLastCalledWith("plain text")
  })

  it("hands Enter to the composer to send when no picker is open", () => {
    const field = mount("hi")
    press(field, "Enter")
    expect(onSendKey).toHaveBeenCalledTimes(1)
  })

  it("keeps Enter in an open picker from sending, and picks instead", () => {
    const field = mount("@")
    const text = field.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 1)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event("selectionchange"))
    })
    expect(container.querySelector("[data-testid=picker]")).not.toBeNull()
    expect(field.getAttribute("aria-haspopup")).toBe("listbox")

    press(field, "Enter")
    expect(onSendKey).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith(`@run:${RUN_ID}`)
    expect(field.textContent).toContain("run 045f759c")
  })

  it("keeps Enter from sending while the picker's matches are still loading", () => {
    candidatesState.loading = true
    const field = mount("@wor")
    const range = document.createRange()
    range.setStart(field.firstChild as Text, 4)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event("selectionchange"))
    })
    expect(press(field, "Enter").defaultPrevented).toBe(true)
    expect(onSendKey).not.toHaveBeenCalled()
    candidatesState.loading = false
  })

  it("copies a selection as reference text and pastes it back as chips", () => {
    const field = mount(`see @run:${RUN_ID}`)
    const range = document.createRange()
    range.selectNodeContents(field)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    const store: Record<string, string> = {}
    const copy = new Event("copy", { bubbles: true, cancelable: true })
    Object.assign(copy, {
      clipboardData: {
        setData: (type: string, text: string) => (store[type] = text),
      },
    })
    act(() => {
      field.dispatchEvent(copy)
    })
    expect(copy.defaultPrevented).toBe(true)
    expect(store["text/plain"]).toBe(`see @run:${RUN_ID}`)

    const cut = new Event("cut", { bubbles: true, cancelable: true })
    Object.assign(cut, { clipboardData: { setData: () => undefined } })
    act(() => {
      field.dispatchEvent(cut)
    })
    expect(field.textContent).toBe("")
    expect(onChange).toHaveBeenLastCalledWith("")

    const paste = new Event("paste", { bubbles: true, cancelable: true })
    Object.assign(paste, {
      clipboardData: { getData: () => store["text/plain"] },
    })
    caretAtEnd(field)
    act(() => {
      field.dispatchEvent(paste)
    })
    expect(field.querySelector("button")).not.toBeNull()
    expect(onChange).toHaveBeenLastCalledWith(`see @run:${RUN_ID}`)
  })

  it("closes the picker on Escape without sending", () => {
    const field = mount("@")
    const range = document.createRange()
    range.setStart(field.firstChild as Text, 1)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event("selectionchange"))
    })
    press(field, "Escape")
    expect(container.querySelector("[data-testid=picker]")).toBeNull()
    expect(onSendKey).not.toHaveBeenCalled()
  })

  it("ignores picker keys while an IME is composing", () => {
    const field = mount("@")
    const range = document.createRange()
    range.setStart(field.firstChild as Text, 1)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event("selectionchange"))
    })
    const composing = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      field.dispatchEvent(composing)
    })
    expect(onChange).not.toHaveBeenCalledWith(`@run:${RUN_ID}`)
  })

  it("clears the field when the parent resets the value after a send", () => {
    function Sender() {
      const [value, setValue] = useState(`hi @run:${RUN_ID}`)
      return (
        <>
          <button
            type="button"
            data-testid="reset"
            onClick={() => setValue("")}
          />
          <ComposerInput
            label="Message Inky"
            value={value}
            onChange={setValue}
            onSendKey={onSendKey}
            placeholder="Ask anything"
            autoFocus={false}
          />
        </>
      )
    }
    act(() => root.render(<Sender />))
    const field = container.querySelector<HTMLElement>(
      "[data-slot=input-group-control]"
    )!
    expect(field.querySelector("button")).not.toBeNull()
    act(() =>
      container.querySelector<HTMLElement>("[data-testid=reset]")?.click()
    )
    expect(field.textContent).toBe("")
    expect(field.querySelector("button")).toBeNull()
  })
})

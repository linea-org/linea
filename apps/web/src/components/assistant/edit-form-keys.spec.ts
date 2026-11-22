import { describe, expect, it, vi } from "vitest"

import { handleEditKeyDown } from "./edit-form-keys"

function press(
  key: string,
  extra: { metaKey?: boolean; ctrlKey?: boolean },
  changed: boolean
) {
  const event = {
    key,
    metaKey: false,
    ctrlKey: false,
    ...extra,
    preventDefault: vi.fn(),
  }
  const onCancel = vi.fn()
  const onSubmit = vi.fn()
  handleEditKeyDown(event, { changed, onCancel, onSubmit })
  return { event, onCancel, onSubmit }
}

describe("editing an earlier message", () => {
  it("submits the edit on mod+enter and consumes the key", () => {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      const { event, onSubmit } = press("Enter", modifier, true)
      expect(onSubmit).toHaveBeenCalledOnce()
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
  })

  it("still consumes mod+enter when nothing changed, so no other draft is sent", () => {
    const { event, onSubmit } = press("Enter", { metaKey: true }, false)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it("leaves a bare Enter for a new line and Escape cancels", () => {
    const enter = press("Enter", {}, true)
    expect(enter.onSubmit).not.toHaveBeenCalled()
    expect(enter.event.preventDefault).not.toHaveBeenCalled()
    expect(press("Escape", {}, true).onCancel).toHaveBeenCalledOnce()
  })
})

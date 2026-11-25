// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

import { insertReference, REFERENCE_TARGET } from "./insert-reference"

describe("insertReference", () => {
  let target: HTMLTextAreaElement

  beforeEach(() => {
    target = document.createElement("textarea")
  })

  function insertAt(value: string, caret: number, json: boolean) {
    target.setAttribute(REFERENCE_TARGET, json ? "json" : "")
    target.value = value
    target.setSelectionRange(caret, caret)
    insertReference(target, 'steps.a["b c"]')
    return target.value
  }

  it("inserts at the caret and reports the change", () => {
    const onInput = vi.fn()
    target.addEventListener("input", onInput)
    expect(insertAt("Hi !", 3, false)).toBe('Hi {{steps.a["b c"]}}!')
    expect(target.selectionStart).toBe(21)
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  it("quotes it outside a JSON string and escapes it inside one", () => {
    expect(JSON.parse(insertAt("", 0, true))).toBe('{{steps.a["b c"]}}')
    expect(JSON.parse(insertAt('{"x": }', 6, true))).toEqual({
      x: '{{steps.a["b c"]}}',
    })
    expect(JSON.parse(insertAt('{"x": "Hi "}', 10, true))).toEqual({
      x: 'Hi {{steps.a["b c"]}}',
    })
  })

  it("counts a quote after an escaped backslash as closing the string", () => {
    const before = String.raw`{"path":"C:\\","value": }`
    expect(JSON.parse(insertAt(before, before.length - 1, true))).toEqual({
      path: "C:\\",
      value: '{{steps.a["b c"]}}',
    })
  })
})

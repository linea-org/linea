import { describe, expect, it } from "vitest"

import { CLICK_SHORTCUTS, SHORTCUTS, comboKeys } from "./definitions"
import { createShortcutEngine } from "./engine"

function key(
  value: string,
  extra: Partial<Parameters<ReturnType<typeof createShortcutEngine>>[0]> = {}
) {
  return {
    key: value,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...extra,
  }
}

describe("shortcut engine", () => {
  it("matches a plain key and a modifier combo", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("c"), false, 0, null)).toBe("create")
    expect(resolve(key("k", { metaKey: true }), false, 0, null)).toBe("search")
    expect(resolve(key("K", { ctrlKey: true }), false, 0, null)).toBe("search")
    expect(resolve(key("?", { shiftKey: true }), false, 0, null)).toBe("help")
  })

  it("ignores plain keys while typing but not modifier combos", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("c"), true, 0, null)).toBeNull()
    expect(resolve(key("k", { metaKey: true }), true, 0, null)).toBe("search")
  })

  it("sends with mod+enter from inside the composer, even while typing", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("Enter", { metaKey: true }), true, 0, "composer")).toBe(
      "send"
    )
    expect(resolve(key("Enter", { ctrlKey: true }), true, 0, "composer")).toBe(
      "send"
    )
  })

  it("does not send from another field, such as the earlier-message editor", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("Enter", { metaKey: true }), true, 0, null)).toBeNull()
    expect(resolve(key("Enter", { ctrlKey: true }), false, 0, null)).toBeNull()
  })

  it("does not send from a dialog or menu, which sit outside the composer", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("Enter", { metaKey: true }), true, 0, null)).toBeNull()
    expect(resolve(key("k", { metaKey: true }), true, 0, null)).toBe("search")
  })

  it("does not send on a bare Enter or with Shift held", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("Enter"), false, 0, "composer")).toBeNull()
    expect(
      resolve(key("Enter", { shiftKey: true }), false, 0, "composer")
    ).toBeNull()
    expect(
      resolve(
        key("Enter", { metaKey: true, shiftKey: true }),
        true,
        0,
        "composer"
      )
    ).toBeNull()
  })

  it("keeps plain page keys from firing in a dialog or field", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("f"), false, 0, null)).toBe("filter")
    expect(resolve(key("f"), true, 0, null)).toBeNull()
    expect(resolve(key("c"), true, 0, null)).toBeNull()
  })

  it("matches a two-key sequence within the timeout only", () => {
    const resolve = createShortcutEngine(1000)
    expect(resolve(key("g"), false, 0, null)).toBeNull()
    expect(resolve(key("w"), false, 500, null)).toBe("go-workflows")
    expect(resolve(key("g"), false, 0, null)).toBeNull()
    expect(resolve(key("w"), false, 2000, null)).toBeNull()
  })

  it("drops a sequence when the next key does not continue it", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("g"), false, 0, null)).toBeNull()
    expect(resolve(key("c"), false, 100, null)).toBe("create")
    expect(resolve(key("h"), false, 200, null)).toBeNull()
  })

  it("does not treat shift+letter or held keys as shortcuts", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("C", { shiftKey: true }), false, 0, null)).toBeNull()
    expect(resolve(key("c", { repeat: true }), false, 0, null)).toBeNull()
    expect(resolve(key("Shift", { shiftKey: true }), false, 0, null)).toBeNull()
  })

  it("keeps a pending sequence across a bare modifier press", () => {
    const resolve = createShortcutEngine()
    resolve(key("g"), false, 0, null)
    resolve(key("Shift", { shiftKey: true }), false, 50, null)
    expect(resolve(key("h"), false, 100, null)).toBe("go-home")
  })

  it("handles a burst of unmatched key presses well inside a frame", () => {
    const resolve = createShortcutEngine()
    const start = performance.now()
    for (let index = 0; index < 100_000; index += 1) {
      resolve(key(index % 2 ? "x" : "y"), false, index, null)
    }
    expect(performance.now() - start).toBeLessThan(250)
  })
})

describe("comboKeys", () => {
  it("draws ⌘ on Mac and Ctrl elsewhere", () => {
    expect(comboKeys("mod+k", true)).toEqual(["⌘", "K"])
    expect(comboKeys("mod+k", false)).toEqual(["Ctrl", "K"])
    expect(comboKeys("g h", true)).toEqual(["G", "H"])
    expect(comboKeys("?", true)).toEqual(["?"])
    expect(comboKeys("mod+enter", true)).toEqual(["⌘", "↵"])
    expect(comboKeys("mod+enter", false)).toEqual(["Ctrl", "↵"])
  })
})

describe("click shortcuts", () => {
  it("are all defined shortcuts on the page", () => {
    for (const id of CLICK_SHORTCUTS)
      expect(SHORTCUTS[id].group).toBe("This page")
  })
})

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
    expect(resolve(key("c"), false, 0)).toBe("create")
    expect(resolve(key("k", { metaKey: true }), false, 0)).toBe("search")
    expect(resolve(key("K", { ctrlKey: true }), false, 0)).toBe("search")
    expect(resolve(key("?", { shiftKey: true }), false, 0)).toBe("help")
  })

  it("ignores plain keys while typing but not modifier combos", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("c"), true, 0)).toBeNull()
    expect(resolve(key("k", { metaKey: true }), true, 0)).toBe("search")
  })

  it("sends with mod+enter, also while typing, but not with a bare Enter", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("Enter", { metaKey: true }), true, 0)).toBe("send")
    expect(resolve(key("Enter", { ctrlKey: true }), true, 0)).toBe("send")
    expect(resolve(key("Enter"), false, 0)).toBeNull()
    expect(resolve(key("Enter", { shiftKey: true }), false, 0)).toBeNull()
  })

  it("keeps plain page keys from firing in a dialog or field", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("f"), false, 0)).toBe("filter")
    expect(resolve(key("f"), true, 0)).toBeNull()
    expect(resolve(key("c"), true, 0)).toBeNull()
  })

  it("matches a two-key sequence within the timeout only", () => {
    const resolve = createShortcutEngine(1000)
    expect(resolve(key("g"), false, 0)).toBeNull()
    expect(resolve(key("w"), false, 500)).toBe("go-workflows")
    expect(resolve(key("g"), false, 0)).toBeNull()
    expect(resolve(key("w"), false, 2000)).toBeNull()
  })

  it("drops a sequence when the next key does not continue it", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("g"), false, 0)).toBeNull()
    expect(resolve(key("c"), false, 100)).toBe("create")
    expect(resolve(key("h"), false, 200)).toBeNull()
  })

  it("does not treat shift+letter or held keys as shortcuts", () => {
    const resolve = createShortcutEngine()
    expect(resolve(key("C", { shiftKey: true }), false, 0)).toBeNull()
    expect(resolve(key("c", { repeat: true }), false, 0)).toBeNull()
    expect(resolve(key("Shift", { shiftKey: true }), false, 0)).toBeNull()
  })

  it("keeps a pending sequence across a bare modifier press", () => {
    const resolve = createShortcutEngine()
    resolve(key("g"), false, 0)
    resolve(key("Shift", { shiftKey: true }), false, 50)
    expect(resolve(key("h"), false, 100)).toBe("go-home")
  })

  it("handles a burst of unmatched key presses well inside a frame", () => {
    const resolve = createShortcutEngine()
    const start = performance.now()
    for (let index = 0; index < 100_000; index += 1) {
      resolve(key(index % 2 ? "x" : "y"), false, index)
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

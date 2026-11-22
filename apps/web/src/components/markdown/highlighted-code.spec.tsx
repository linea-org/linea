import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const highlightSpies = vi.hoisted(() => [] as { mock: { calls: unknown[] } }[])

vi.mock("lowlight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lowlight")>()
  return {
    ...actual,
    createLowlight: (...args: Parameters<typeof actual.createLowlight>) => {
      const instance = actual.createLowlight(...args)
      highlightSpies.push(vi.spyOn(instance, "highlight"))
      return instance
    },
  }
})

const { default: HighlightedCode } = await import("./highlighted-code")

const render = (code: string, language = "ts") =>
  renderToStaticMarkup(createElement(HighlightedCode, { code, language }))

describe("highlighted code", () => {
  it("does not re-highlight code that has not changed", () => {
    const first = render("const cached = 1\n")
    const second = render("const cached = 1\n")

    expect(second).toBe(first)
    expect(highlightSpies[0]?.mock.calls).toHaveLength(1)
  })

  it("highlights again when the code or language changes", () => {
    const before = highlightSpies[0]?.mock.calls.length ?? 0
    render("const changed = 1\n")
    render("const changed = 2\n")
    render("const changed = 2\n", "javascript")

    expect(highlightSpies[0]?.mock.calls).toHaveLength(before + 3)
  })
})

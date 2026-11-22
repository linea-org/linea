// @vitest-environment jsdom
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { ModelMarkdown } from "./model-markdown"

vi.mock("./highlighted-code", () => {
  throw new Error("chunk failed to load")
})

it("keeps rendering the reply as plain code when the highlighter chunk fails to load", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  const container = document.createElement("div")
  const root = createRoot(container)

  root.render(
    createElement(ModelMarkdown, {
      content: "Here you go\n\n```ts\nconst x = 1\n```",
    })
  )

  await vi.waitFor(() =>
    expect(errorSpy).toHaveBeenCalledWith(
      "Code highlighter failed to load",
      expect.any(Error)
    )
  )
  expect(container.textContent).toContain("Here you go")
  expect(container.querySelector("pre code")?.textContent).toBe("const x = 1\n")
  expect(container.querySelector("[class*='text-code-']")).toBeNull()

  root.unmount()
  errorSpy.mockRestore()
})

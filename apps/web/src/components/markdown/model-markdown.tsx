import { lazy, Suspense } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"

import { HighlighterErrorBoundary } from "./highlighter-error-boundary"

const HighlightedCode = lazy(() => import("./highlighted-code"))

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 text-lg font-semibold last:mb-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-base font-semibold last:mb-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 text-base font-semibold last:mb-0">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-current/30 pl-3 italic last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // remark gives fenced blocks a trailing newline and, when a language is given, a
    // "language-xxx" className; inline `code` spans have neither.
    const isBlock =
      Boolean(className) ||
      (typeof children === "string" && children.endsWith("\n"))
    if (!isBlock) {
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {children}
        </code>
      )
    }
    const plain = <code className={className}>{children}</code>
    const language = /language-(\S+)/.exec(className ?? "")?.[1]
    if (!language || typeof children !== "string") return plain
    return (
      <HighlighterErrorBoundary fallback={plain}>
        <Suspense fallback={plain}>
          <HighlightedCode code={children} language={language} />
        </Suspense>
      </HighlighterErrorBoundary>
    )
  },
  hr: () => <hr className="my-3 border-border" />,
  h4: ({ children }) => (
    <h4 className="mb-2 font-semibold last:mb-0">{children}</h4>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-hidden rounded-md border last:mb-0">
      <Table>{children}</Table>
    </div>
  ),
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableHead className="px-3">{children}</TableHead>,
  td: ({ children }) => (
    <TableCell className="px-3 whitespace-normal">{children}</TableCell>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs last:mb-0">
      {children}
    </pre>
  ),
}

export function ModelMarkdown({ content }: Readonly<{ content: string }>) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
      disallowedElements={["img"]}
    >
      {content}
    </ReactMarkdown>
  )
}

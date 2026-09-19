import type { UIMessage } from "ai"

export type DocsSearchResult = {
  title: string
  url: string
  content: string
}

type DocsAssistantTools = {
  searchDocs: {
    input: { query: string }
    output: DocsSearchResult[]
  }
}

export type DocsAssistantMessage = UIMessage<unknown, never, DocsAssistantTools>

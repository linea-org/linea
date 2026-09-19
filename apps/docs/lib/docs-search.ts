import type { DocsSearchResult } from "@/lib/docs-assistant-types"
import { source } from "@/lib/source"
import { Index } from "@upstash/vector"

type DocsVectorMetadata = {
  title: string
  url: string
}

const MAX_RESULTS = 4
const MAX_SOURCE_LENGTH = 5_000
const ignoredTerms = new Set([
  "about",
  "from",
  "have",
  "page",
  "show",
  "that",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
])

function hasVectorCredentials() {
  const hasUrl = Boolean(process.env.UPSTASH_VECTOR_REST_URL)
  const hasToken = Boolean(process.env.UPSTASH_VECTOR_REST_TOKEN)
  if (hasUrl !== hasToken)
    throw new Error(
      "Set both UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN."
    )
  return hasUrl && hasToken
}

async function searchVectorDocs(query: string, currentPath?: string) {
  const index = new Index<DocsVectorMetadata>()
  const matches = await index.namespace("linea-docs").query({
    data: query,
    topK: 8,
    includeData: true,
    includeMetadata: true,
  })
  const rankedMatches = matches
    .filter(
      (match) =>
        match.data &&
        match.metadata?.title &&
        match.metadata.url.startsWith("/docs")
    )
    .sort(
      (left, right) =>
        right.score +
        (right.metadata?.url === currentPath ? 0.05 : 0) -
        (left.score + (left.metadata?.url === currentPath ? 0.05 : 0))
    )
  const results: DocsSearchResult[] = []
  for (const match of rankedMatches) {
    const title = match.metadata?.title
    const url = match.metadata?.url
    if (!title || !url || !match.data) continue
    const existing = results.find((result) => result.url === url)
    if (existing) {
      existing.content = `${existing.content}\n\n${match.data}`.slice(
        0,
        MAX_SOURCE_LENGTH
      )
      continue
    }
    results.push({
      title,
      url,
      content: match.data.slice(0, MAX_SOURCE_LENGTH),
    })
    if (results.length === MAX_RESULTS) break
  }
  return results
}

function getSearchTerms(query: string) {
  return [...new Set(query.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? [])].filter(
    (term) => !ignoredTerms.has(term)
  )
}

async function searchLocalDocs(query: string, currentPath?: string) {
  const terms = getSearchTerms(query)
  const pages = await Promise.all(
    source.getPages().map(async (page) => {
      const content = await page.data.getText("processed")
      const searchableTitle = page.data.title.toLowerCase()
      const searchableContent = content.toLowerCase()
      const relevance =
        (page.url === currentPath ? 20 : 0) +
        terms.reduce(
          (score, term) =>
            score +
            (searchableTitle.includes(term) ? 5 : 0) +
            (searchableContent.includes(term) ? 1 : 0),
          0
        )
      return { title: page.data.title, url: page.url, content, relevance }
    })
  )
  return pages
    .filter((page) => page.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, MAX_RESULTS)
    .map(({ title, url, content }) => ({
      title,
      url,
      content: content.slice(0, MAX_SOURCE_LENGTH),
    }))
}

export async function searchDocs(
  query: string,
  currentPath?: string
): Promise<DocsSearchResult[]> {
  return hasVectorCredentials()
    ? searchVectorDocs(query, currentPath)
    : searchLocalDocs(query, currentPath)
}

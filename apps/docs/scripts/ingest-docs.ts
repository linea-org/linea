import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { Index } from "@upstash/vector"

type DocsVectorMetadata = {
  title: string
  url: string
}

const docsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../content/docs"
)
const namespace = "linea-docs"
const maxChunkLength = 1_400
const chunkOverlap = 180

async function findMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory()
        ? findMdxFiles(path)
        : Promise.resolve(entry.name.endsWith(".mdx") ? [path] : [])
    })
  )
  return nestedFiles.flat()
}

function getTitle(content: string, path: string) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  const title = frontmatter?.[1]?.match(/^title:\s*(.+)$/m)?.[1]
  if (title) return title.replace(/^['"]|['"]$/g, "")
  return (
    path
      .split(sep)
      .at(-1)
      ?.replace(/\.mdx$/, "") ?? "Linea documentation"
  )
}

function getUrl(path: string) {
  const slug = relative(docsDirectory, path)
    .split(sep)
    .join("/")
    .replace(/\.mdx$/, "")
    .replace(/(^|\/)index$/, "")
  return `/docs${slug ? `/${slug}` : ""}`
}

function cleanMdx(content: string) {
  return content
    .replace(/^---\s*\n[\s\S]*?\n---\s*/, "")
    .replace(/^import\s.+$/gm, "")
    .replace(/^export\s.+$/gm, "")
    .replace(/<\/?[A-Z][^>]*>/g, "")
    .trim()
}

function splitLongText(text: string) {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxChunkLength))
    start += maxChunkLength - chunkOverlap
  }
  return chunks
}

function chunkDocument(text: string) {
  const chunks: string[] = []
  let current = ""
  for (const paragraph of text.split(/\n{2,}/).filter(Boolean)) {
    if (paragraph.length > maxChunkLength) {
      if (current) chunks.push(current)
      chunks.push(...splitLongText(paragraph))
      current = ""
      continue
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length <= maxChunkLength) {
      current = candidate
      continue
    }
    chunks.push(current)
    current = `${current.slice(-chunkOverlap)}\n\n${paragraph}`
  }
  if (current) chunks.push(current)
  return chunks
}

function getChunkId(url: string, index: number) {
  return createHash("sha256")
    .update(`${url}:${index}`)
    .digest("hex")
    .slice(0, 32)
}

async function main() {
  if (
    !process.env.UPSTASH_VECTOR_REST_URL ||
    !process.env.UPSTASH_VECTOR_REST_TOKEN
  )
    throw new Error(
      "Set UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN before ingesting docs."
    )
  const files = await findMdxFiles(docsDirectory)
  const vectors = (
    await Promise.all(
      files.map(async (path) => {
        const source = await readFile(path, "utf8")
        const title = getTitle(source, path)
        const url = getUrl(path)
        return chunkDocument(cleanMdx(source)).map((content, index) => ({
          id: getChunkId(url, index),
          data: `# ${title}\n\n${content}`,
          metadata: { title, url },
        }))
      })
    )
  ).flat()
  if (vectors.length === 0)
    throw new Error("No documentation chunks were generated.")
  const docsIndex = new Index<DocsVectorMetadata>().namespace(namespace)
  await docsIndex.reset()
  for (let start = 0; start < vectors.length; start += 100) {
    await docsIndex.upsert(vectors.slice(start, start + 100))
  }
  process.stdout.write(
    `Indexed ${vectors.length} chunks from ${files.length} docs pages.\n`
  )
}

await main()

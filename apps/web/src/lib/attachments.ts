export type Attachment = { name: string; content: string }
export type RejectedFile = { name: string; reason: string }

export const MAX_ATTACHMENTS = 5
/** For all files together, as sent; the rest of the API's 128 KB is for the message and graph. */
export const MAX_ATTACHMENT_BYTES = 100_000
export const LONG_PASTE_CHARACTERS = 2_000

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "log",
  "toml",
  "sql",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "go",
  "sh",
])

type FileInfo = { name: string; size: number; type: string }

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? ""
}

function isTextFile(file: FileInfo): boolean {
  return (
    file.type.startsWith("text/") ||
    /^application\/(json|xml|yaml)/.test(file.type) ||
    TEXT_EXTENSIONS.has(extensionOf(file.name))
  )
}

/** What text takes up in a JSON request, where newlines and quotes are written as two bytes. */
function encodedBytes(text: string): number {
  return new Blob([JSON.stringify(text)]).size
}

type ReadFile =
  { name: string; content: string } | { name: string; reason: string }

const TOO_LARGE = `Over ${MAX_ATTACHMENT_BYTES / 1000} KB in total`

async function readFile(file: File): Promise<ReadFile> {
  const { name } = file
  if (!isTextFile(file)) return { name, reason: "Text files only" }
  if (file.size > MAX_ATTACHMENT_BYTES) return { name, reason: TOO_LARGE }
  try {
    return { name, content: await file.text() }
  } catch {
    // A dropped folder looks like a file until it is read.
    return { name, reason: "Couldn't be read" }
  }
}

function uniqueName(name: string, attached: readonly Attachment[]): string {
  const taken = new Set(attached.map((item) => item.name))
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf(".")
  const [stem, end] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  let copy = 2
  while (taken.has(`${stem} ${copy}${end}`)) copy += 1
  return `${stem} ${copy}${end}`
}

export async function readAttachments(
  files: File[],
  current: readonly Attachment[]
): Promise<{ attachments: Attachment[]; rejected: RejectedFile[] }> {
  const attachments = [...current]
  const rejected: RejectedFile[] = []
  let used = current.reduce((sum, item) => sum + encodedBytes(item.content), 0)
  for (const file of await Promise.all(files.map(readFile))) {
    if ("reason" in file) {
      rejected.push(file)
      continue
    }
    const { name, content } = file
    const bytes = encodedBytes(content)
    if (attachments.length >= MAX_ATTACHMENTS) {
      rejected.push({ name, reason: `Up to ${MAX_ATTACHMENTS} files` })
    } else if (used + bytes > MAX_ATTACHMENT_BYTES) {
      rejected.push({ name, reason: TOO_LARGE })
    } else {
      used += bytes
      attachments.push({ name: uniqueName(name, attachments), content })
    }
  }
  return { attachments, rejected }
}

/** A long paste as a file, so it does not bury the message; null when it is short enough to type. */
export function pastedFile(text: string): File | null {
  if (text.length <= LONG_PASTE_CHARACTERS) return null
  return new File([text], "Pasted text.txt", { type: "text/plain" })
}

/** Such as "CSV · 12 lines". */
export function attachmentSummary({ name, content }: Attachment): string {
  const lines = content.split("\n").length
  const extension = extensionOf(name)
  const count = `${lines} ${lines === 1 ? "line" : "lines"}`
  return extension && extension !== name.toLowerCase()
    ? `${extension.toUpperCase()} · ${count}`
    : count
}

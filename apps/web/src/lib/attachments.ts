export type Attachment = { name: string; content: string }
export type RejectedFile = { name: string; reason: string }

export const MAX_ATTACHMENTS = 5
/** For all files together: the API refuses a message body over 128 KB. */
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

function bytesOf(text: string): number {
  return new Blob([text]).size
}

/** Why a file cannot be attached, or null when it can. */
export function attachmentProblem(
  file: FileInfo,
  attached: readonly Attachment[]
): string | null {
  if (attached.length >= MAX_ATTACHMENTS) {
    return `Up to ${MAX_ATTACHMENTS} files`
  }
  if (!isTextFile(file)) return "Text files only"
  const used = attached.reduce((sum, item) => sum + bytesOf(item.content), 0)
  if (used + file.size > MAX_ATTACHMENT_BYTES) {
    return `Over ${MAX_ATTACHMENT_BYTES / 1000} KB in total`
  }
  return null
}

function uniqueName(name: string, attached: readonly Attachment[]): string {
  const taken = new Set(attached.map((item) => item.name))
  const dot = name.lastIndexOf(".")
  const [stem, end] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  let candidate = name
  for (let copy = 2; taken.has(candidate); copy++) {
    candidate = `${stem} ${copy}${end}`
  }
  return candidate
}

export async function readAttachments(
  files: File[],
  current: readonly Attachment[]
): Promise<{ attachments: Attachment[]; rejected: RejectedFile[] }> {
  const attachments = [...current]
  const rejected: RejectedFile[] = []
  for (const file of files) {
    const reason = attachmentProblem(file, attachments)
    if (reason) {
      rejected.push({ name: file.name, reason })
      continue
    }
    try {
      const content = await file.text()
      attachments.push({ name: uniqueName(file.name, attachments), content })
    } catch {
      // A dropped folder looks like a file until it is read.
      rejected.push({ name: file.name, reason: "Couldn't be read" })
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

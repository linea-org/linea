export type Attachment = { name: string; content: string }

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 100_000

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

/** Why a file cannot be attached, or null when it can. */
export function attachmentProblem(
  file: FileInfo,
  alreadyAttached: number
): string | null {
  if (alreadyAttached >= MAX_ATTACHMENTS) {
    return `Attach up to ${MAX_ATTACHMENTS} files`
  }
  if (!isTextFile(file)) {
    return `${file.name}: only text files for now (images and PDFs are not supported yet)`
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is larger than ${MAX_ATTACHMENT_BYTES / 1000} KB`
  }
  return null
}

export async function readAttachments(
  files: File[],
  current: Attachment[]
): Promise<{ attachments: Attachment[]; problems: string[] }> {
  const attachments = [...current]
  const problems: string[] = []
  for (const file of files) {
    const problem = attachmentProblem(file, attachments.length)
    if (problem) {
      problems.push(problem)
      continue
    }
    attachments.push({ name: file.name, content: await file.text() })
  }
  return { attachments, problems }
}

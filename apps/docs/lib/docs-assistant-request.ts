import { isIP } from "node:net"
import { z } from "zod"

const requestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          id: z.string().min(1).max(128),
          role: z.enum(["user", "assistant"]),
          parts: z
            .array(
              z.object({
                type: z.literal("text"),
                text: z.string().min(1).max(6_000),
              })
            )
            .min(1)
            .max(16),
        })
      )
      .min(1)
      .max(11),
    currentPath: z
      .string()
      .max(512)
      .regex(/^\/docs(?:\/[^?#\s]*)?$/)
      .optional(),
  })
  .transform((body, context) => {
    if (
      body.messages.length % 2 !== 1 ||
      !body.messages.every((message, index) => {
        const text = message.parts.map((part) => part.text).join("")
        return (
          message.role === (index % 2 === 0 ? "user" : "assistant") &&
          text.trim().length > 0 &&
          text.length <= (message.role === "user" ? 500 : 6_000)
        )
      })
    )
      context.addIssue({ code: "custom", message: "Invalid chat history." })
    return body
  })

export function getDocsClientId(request: Request) {
  const header = process.env.VERCEL
    ? "x-vercel-forwarded-for"
    : process.env.DOCS_ASSISTANT_TRUST_PROXY === "1"
      ? "x-forwarded-for"
      : null
  if (!header) return process.env.NODE_ENV !== "production" ? "local" : null
  const ip = request.headers.get(header)?.split(",").at(-1)?.trim()
  if (!ip || ip.includes("%") || !isIP(ip)) return null
  if (isIP(ip) === 4) return ip
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const [left = "", right] = canonical.split("::")
  const start = left ? left.split(":") : []
  const end = right ? right.split(":") : []
  const words =
    right === undefined
      ? start
      : [
          ...start,
          ...Array<string>(8 - start.length - end.length).fill("0"),
          ...end,
        ]
  if (words.slice(0, 5).every((word) => word === "0") && words[5] === "ffff") {
    return words
      .slice(6)
      .flatMap((word) => [parseInt(word, 16) >> 8, parseInt(word, 16) & 255])
      .join(".")
  }
  return `${words.slice(0, 4).join(":")}::/64`
}

export function isDocsBrowserRequestAllowed(request: Request) {
  const origin = request.headers.get("origin")
  return (
    request.headers.get("sec-fetch-site") !== "cross-site" &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ===
      "application/json"
  )
}

export async function readDocsAssistantRequest(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing request body.")
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(5_000)])
  let cancellation: Promise<void> | undefined
  const abort = () => {
    cancellation = reader.cancel(deadline.reason)
  }
  deadline.addEventListener("abort", abort, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    deadline.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      deadline.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > 48_000) throw new Error("Request body too large.")
      chunks.push(value)
    }
    return requestSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    )
  } finally {
    deadline.removeEventListener("abort", abort)
    try {
      await (cancellation ?? reader.cancel())
    } finally {
      reader.releaseLock()
    }
  }
}

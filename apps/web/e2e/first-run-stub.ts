import { createServer, type IncomingMessage } from "node:http"
import { z } from "zod"

export const ACCEPTED_KEY = "sk-first-run-accepted"
export const MODEL_REPLY = "Hello from the stubbed model."

const emailSchema = z.object({ to: z.string(), text: z.string() })

async function readBody(request: IncomingMessage): Promise<string> {
  let body = ""
  for await (const chunk of request) body += String(chunk)
  return body
}

/** Stands in for Resend and OpenAI, so a run needs no inbox and no real key. */
export async function startFirstRunStub(port: number) {
  const emails: z.infer<typeof emailSchema>[] = []
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request)
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "content-type": "application/json" })
        response.end(JSON.stringify(value))
      }
      if (request.url === "/emails") {
        emails.push(emailSchema.parse(JSON.parse(body)))
        return send(200, { id: "stub-email" })
      }
      if (request.url !== "/v1/chat/completions") return send(404, {})
      if (request.headers.authorization !== `Bearer ${ACCEPTED_KEY}`)
        return send(401, { error: { message: "Incorrect API key provided." } })
      send(200, {
        choices: [{ message: { role: "assistant", content: MODEL_REPLY } }],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      })
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, resolve)
  })
  return {
    verificationLink(to: string): string | undefined {
      const email = emails.find((sent) => sent.to === to)
      return email && /https?:\/\/\S+/.exec(email.text)?.[0]
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

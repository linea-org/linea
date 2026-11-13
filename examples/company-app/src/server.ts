import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { LineaEnvironmentClient, environmentKey } from "@linea/sdk/server"
import { createAccessGate, sessionLifetimeMs } from "./access-gate.ts"
import {
  allowedRepository,
  parseAllowedRepositories,
} from "./allowed-repositories.ts"
import { HttpError } from "./http-error.ts"
import { presentTask } from "./present-task.ts"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required; see README.md`)
  return value
}

// Server-only configuration: the Environment key must never reach the browser.
const environmentId = required("LINEA_ENVIRONMENT_ID")
const apiUrl = process.env.LINEA_API_URL ?? "http://localhost:3000"
const client = new LineaEnvironmentClient({
  environmentId,
  environmentKey: environmentKey(required("LINEA_ENVIRONMENT_KEY")),
  baseUrl: apiUrl,
})
const agentId = required("LINEA_AGENT_ID")
const dashboardUrl = process.env.LINEA_DASHBOARD_URL ?? "http://localhost:3001"
const workspaceSlug = required("LINEA_WORKSPACE_SLUG")
const issuerSubject = required("DEMO_END_USER_SUBJECT")
const gate = createAccessGate(required("DEMO_ACCESS_CODE"), Date.now)
const repositories = parseAllowedRepositories(required("ALLOWED_REPOSITORIES"))
const port = Number(process.env.PORT ?? 4000)
const host = process.env.HOST ?? "127.0.0.1"
const publicOrigin = new URL(
  process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`
).origin
const secure = publicOrigin.startsWith("https:")
if (!secure && !["127.0.0.1", "::1", "localhost"].includes(host))
  throw new Error(
    "Set PUBLIC_ORIGIN to an https:// origin before listening beyond localhost; see README.md"
  )
// The __Host- prefix makes browsers reject the cookie unless it is Secure, host-only and Path=/.
const cookieName = secure ? "__Host-demo_session" : "demo_session"
const cookieAttributes = `HttpOnly; SameSite=Strict; Path=/${secure ? "; Secure" : ""}`

const maxBodyBytes = 4096
const maxTasksPerSession = 5

async function readBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new HttpError(413, "Request is too large")
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new HttpError(400, "Request body must be JSON")
  }
}

function sessionId(request: IncomingMessage): string | undefined {
  return new RegExp(`(?:^|; )${cookieName}=([0-9a-f-]{36})`).exec(
    request.headers.cookie ?? ""
  )?.[1]
}

function setSessionCookie(
  response: ServerResponse,
  value: string,
  maxAgeSeconds: number
) {
  response.setHeader(
    "set-cookie",
    `${cookieName}=${value}; Max-Age=${maxAgeSeconds}; ${cookieAttributes}`
  )
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

const files: Record<string, [string, string]> = {
  "/": ["web/index.html", "text/html"],
  "/main.js": ["dist/main.js", "text/javascript"],
}

createServer({ requestTimeout: 10_000 }, (request, response) => {
  void handle(request, response).catch((error: unknown) => {
    if (error instanceof HttpError) {
      for (const [name, value] of Object.entries(error.headers))
        response.setHeader(name, value)
      json(response, error.status, { message: error.message })
      return
    }
    console.error(error)
    json(response, 500, { message: "Request failed" })
  })
}).listen(port, host)

async function handle(request: IncomingMessage, response: ServerResponse) {
  const path = new URL(request.url ?? "/", "http://localhost").pathname
  const file = files[path]
  if (request.method === "GET" && file) {
    response.writeHead(200, { "content-type": file[1] })
    response.end(await readFile(new URL(`../${file[0]}`, import.meta.url)))
    return
  }
  if (request.method === "GET" && path === "/api/config") {
    // Both values are public: the browser SDK calls the Linea API directly for reviews.
    json(response, 200, { environmentId, apiUrl })
    return
  }
  // Browsers always send Origin on POST, so this blocks cross-origin form and fetch requests, including same-site ones SameSite allows.
  if (request.method === "POST" && request.headers.origin !== publicOrigin)
    throw new HttpError(403, "Cross-origin request refused")
  if (request.method === "POST" && path === "/api/session") {
    const body = await readBody(request)
    const session = gate.signIn(
      typeof body === "object" && body !== null && "code" in body
        ? body.code
        : undefined,
      request.socket.remoteAddress ?? "unknown"
    )
    setSessionCookie(response, session.id, sessionLifetimeMs / 1000)
    response.writeHead(204).end()
    return
  }
  if (request.method === "POST" && path === "/api/session/logout") {
    gate.signOut(sessionId(request))
    setSessionCookie(response, "", 0)
    response.writeHead(204).end()
    return
  }
  if (request.method === "POST" && path === "/api/tasks") {
    const owned = gate.session(sessionId(request)).tasks
    if (owned.size >= maxTasksPerSession)
      throw new HttpError(429, "Task limit reached for this demo session")
    // Reserve the slot before any await so overlapping requests cannot all pass the limit.
    const slot = crypto.randomUUID()
    owned.add(slot)
    try {
      const repository = allowedRepository(
        repositories,
        await readBody(request)
      )
      const subject = await client.provisionSubject({
        issuerSubject,
        metadata: {},
      })
      const execution = await client.startExecution({
        agentId,
        externalSubjectId: subject.id,
        input: { repository },
      })
      owned.add(execution.id)
      json(response, 202, { id: execution.id, ...taskFor(execution) })
    } finally {
      owned.delete(slot)
    }
    return
  }
  const match = /^\/api\/tasks\/([0-9a-f-]{36})$/.exec(path)
  if (request.method === "GET" && match?.[1]) {
    if (!gate.session(sessionId(request)).tasks.has(match[1]))
      throw new HttpError(404, "Not found")
    json(response, 200, taskFor(await client.getExecution(match[1])))
    return
  }
  json(response, 404, { message: "Not found" })
}

function taskFor(execution: Awaited<ReturnType<typeof client.getExecution>>) {
  return {
    ...presentTask(execution),
    // For the company's developers, not the End User: the same Execution in Linea.
    developerUrl: `${dashboardUrl}/w/${workspaceSlug}/executions/${execution.id}`,
  }
}

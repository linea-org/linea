import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { LineaEnvironmentClient, environmentKey } from "@linea/sdk/server"
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

const maxBodyBytes = 4096
const maxTasksPerSession = 5

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new HttpError(413, "Request is too large")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

// Demo only: each browser gets an opaque session and can only read tasks it started. A real app uses its own sign-in and derives the End User subject from it.
const sessions = new Map<string, Set<string>>()

function sessionFor(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
): Set<string> {
  const cookie = /(?:^|; )demo_session=([0-9a-f-]{36})/.exec(
    request.headers.cookie ?? ""
  )
  const existing = cookie?.[1] ? sessions.get(cookie[1]) : undefined
  if (existing) return existing
  const id = crypto.randomUUID()
  const tasks = new Set<string>()
  sessions.set(id, tasks)
  response.setHeader(
    "set-cookie",
    `demo_session=${id}; HttpOnly; SameSite=Strict; Path=/`
  )
  return tasks
}

function json(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown
) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function repositoryFrom(body: unknown): string {
  const repository =
    typeof body === "object" && body !== null && "repository" in body
      ? body.repository
      : undefined
  if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("Enter a repository as owner/name")
  return repository
}

const files: Record<string, [string, string]> = {
  "/": ["web/index.html", "text/html"],
  "/main.js": ["dist/main.js", "text/javascript"],
}

createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    json(response, error instanceof HttpError ? error.status : 400, {
      message: error instanceof Error ? error.message : "Request failed",
    })
  })
}).listen(Number(process.env.PORT ?? 4000), process.env.HOST ?? "127.0.0.1")

async function handle(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
) {
  const path = new URL(request.url ?? "/", "http://localhost").pathname
  const file = files[path]
  if (request.method === "GET" && file) {
    response.writeHead(200, { "content-type": file[1] })
    response.end(await readFile(new URL(`../${file[0]}`, import.meta.url)))
    return
  }
  if (request.method === "GET" && path === "/api/config") {
    json(response, 200, { environmentId, apiUrl })
    return
  }
  if (request.method === "POST" && path === "/api/tasks") {
    const owned = sessionFor(request, response)
    if (owned.size >= maxTasksPerSession)
      throw new HttpError(429, "Task limit reached for this demo session")
    const repository = repositoryFrom(await readBody(request))
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
    return
  }
  const match = /^\/api\/tasks\/([0-9a-f-]{36})$/.exec(path)
  if (request.method === "GET" && match?.[1]) {
    if (!sessionFor(request, response).has(match[1]))
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

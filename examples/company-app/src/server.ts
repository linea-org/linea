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

async function readBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
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
    json(response, 400, {
      message: error instanceof Error ? error.message : "Request failed",
    })
  })
}).listen(Number(process.env.PORT ?? 4000))

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
    json(response, 202, { id: execution.id, ...taskFor(execution) })
    return
  }
  const match = /^\/api\/tasks\/([\w-]+)$/.exec(path)
  if (request.method === "GET" && match?.[1]) {
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

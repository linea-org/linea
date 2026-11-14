import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { after, before, test } from "node:test"

const port = 45173
const origin = `http://localhost:${port}`
const code = "correct-horse-battery-staple"
const server = spawn(process.execPath, ["src/server.ts"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    LINEA_ENVIRONMENT_ID: "00000000-0000-4000-8000-000000000000",
    LINEA_ENVIRONMENT_KEY: "lin_env_testtesttesttesttesttest",
    LINEA_AGENT_ID: "00000000-0000-4000-8000-000000000001",
    // Unreachable on purpose: these tests must never depend on a Linea call.
    LINEA_API_URL: "http://127.0.0.1:9",
    LINEA_WORKSPACE_SLUG: "demo",
    DEMO_END_USER_SUBJECT: "demo-user",
    DEMO_ACCESS_CODE: code,
    ALLOWED_REPOSITORIES: "acme/demo",
    PORT: String(port),
  },
  stdio: "inherit",
})

function post(path: string, body: unknown, headers: Record<string, string>) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

before(async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const ready = await fetch(`${origin}/api/config`).then(
      () => true,
      () => false
    )
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("The example server did not start")
})

after(() => server.kill())

test("refuses state-changing requests from another origin", async () => {
  const response = await post(
    "/api/session",
    { code },
    { origin: "http://localhost:4001" }
  )
  assert.equal(response.status, 403)
})

test("signs in, rejects unlisted repositories before calling Linea, and signs out", async () => {
  const signIn = await post("/api/session", { code }, { origin })
  assert.equal(signIn.status, 204)
  const cookie = signIn.headers.get("set-cookie") ?? ""
  assert.match(cookie, /^demo_session=[0-9a-f-]{36}; Max-Age=3600; HttpOnly/)
  const session = { origin, cookie: cookie.split(";")[0] ?? "" }
  const unlisted = await post(
    "/api/tasks",
    { repository: "acme/private-billing" },
    session
  )
  assert.equal(unlisted.status, 403)
  const signOut = await post("/api/session/logout", {}, session)
  assert.equal(signOut.status, 204)
  assert.match(signOut.headers.get("set-cookie") ?? "", /Max-Age=0/)
  const afterSignOut = await post(
    "/api/tasks",
    { repository: "acme/demo" },
    session
  )
  assert.equal(afterSignOut.status, 401)
})

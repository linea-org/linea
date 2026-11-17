import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const repository = resolve(import.meta.dirname, "../../..")
const temporary = mkdtempSync(join(tmpdir(), "linealabs-sdk-server-"))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli)
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
try {
  for (const packageName of ["@linealabs/sdk"]) {
    execFileSync(
      pnpmCommand,
      pnpmArguments([
        "--filter",
        packageName,
        "pack",
        "--pack-destination",
        temporary,
      ]),
      { cwd: repository, stdio: "inherit" }
    )
  }
  const archives = readdirSync(temporary).filter((file) =>
    file.endsWith(".tgz")
  )
  const sdkArchive = archives.find((file) => file.startsWith("linealabs-sdk-"))
  if (!sdkArchive) throw new Error("Packed archives are missing")
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@linealabs/sdk": `file:${join(temporary, sdkArchive)}`,
      },
    })
  )
  writeFileSync(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        skipLibCheck: false,
      },
      include: ["index.ts"],
    })
  )
  writeFileSync(
    join(temporary, "index.ts"),
    `import { Linea } from "@linealabs/sdk"
import { LineaUserClient } from "@linealabs/sdk/user"
import { verifyWebhook, verifyWebhookSignature } from "@linealabs/sdk/webhooks"
import { LineaEnvironmentClient, Linea as ServerLinea, environmentKey } from "@linealabs/sdk/server"
const environment = new LineaEnvironmentClient({ environmentId: "app", environmentKey: environmentKey("lin_env_secret") })
const linea = new Linea({ apiKey: "lin_secret" })
const runs: Promise<unknown>[] = [linea.workflows.run("workflow-id", { input: {} }), linea.executions.wait("execution-id")]
// @ts-expect-error a plain string cannot stand in for a typed Environment credential
new LineaEnvironmentClient({ environmentId: "app", environmentKey: "lin_env_secret" })
export { environment, linea, runs, ServerLinea, LineaUserClient, verifyWebhook, verifyWebhookSignature }
`
  )
  writeFileSync(
    join(temporary, "webhook.mjs"),
    `import { createHmac } from "node:crypto"
import { verifyWebhook } from "@linealabs/sdk/webhooks"
const secret = "webhook-secret"
const eventId = "event-1"
const now = new Date("2026-09-18T12:00:00.000Z")
const timestamp = String(now.getTime() / 1000)
const body = Buffer.from(JSON.stringify({ id: eventId, type: "execution.completed", version: 1, createdAt: now.toISOString(), environmentId: "environment-1", data: { executionId: "00000000-0000-4000-8000-000000000001", status: "succeeded" } }))
const digest = createHmac("sha256", secret).update(timestamp + "." + eventId + ".").update(body).digest("hex")
const result = verifyWebhook({ body, eventId, timestamp, signature: "v1=" + digest, currentSecret: secret, previousSecret: null, previousSecretExpiresAt: null, now, timestampToleranceSeconds: 300 })
if (!result.valid || result.envelope.id !== eventId) throw new Error("Packed webhook verification failed")
`
  )
  execFileSync(
    pnpmCommand,
    pnpmArguments(["install", "--ignore-scripts", "--no-lockfile"]),
    { cwd: temporary, stdio: "inherit" }
  )
  const typescript = resolve(repository, "node_modules/typescript/bin/tsc")
  execFileSync(process.execPath, [typescript, "--project", "tsconfig.json"], {
    cwd: temporary,
    stdio: "inherit",
  })
  execFileSync(process.execPath, ["webhook.mjs"], {
    cwd: temporary,
    stdio: "inherit",
  })
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

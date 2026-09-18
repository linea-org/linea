import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const repository = resolve(import.meta.dirname, "../../..")
const temporary = mkdtempSync(join(tmpdir(), "linea-sdk-server-"))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmCommand = pnpmCli.endsWith(".exe") ? pnpmCli : process.execPath
const pnpmArguments = (arguments_) =>
  pnpmCli.endsWith(".exe") ? arguments_ : [pnpmCli, ...arguments_]
try {
  for (const packageName of ["@linea/protocol", "@linea/sdk"]) {
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
  const protocolArchive = archives.find((file) =>
    file.startsWith("linea-protocol-")
  )
  const sdkArchive = archives.find((file) => file.startsWith("linea-sdk-"))
  if (!protocolArchive || !sdkArchive)
    throw new Error("Packed archives are missing")
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@linea/protocol": `file:${join(temporary, protocolArchive)}`,
        "@linea/sdk": `file:${join(temporary, sdkArchive)}`,
      },
      pnpm: {
        overrides: {
          "@linea/protocol": `file:${join(temporary, protocolArchive)}`,
        },
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
    `import { LineaClient } from "@linea/sdk"
import { LineaUserClient } from "@linea/sdk/user"
import { verifyWebhook, verifyWebhookSignature } from "@linea/sdk/webhooks"
import { LineaApplicationClient, LineaWorkspaceClient, applicationKey, workspaceKey } from "@linea/sdk/server"
const application = new LineaApplicationClient({ applicationId: "app", applicationKey: applicationKey("lin_app_secret") })
const workspace = new LineaWorkspaceClient({ workspaceKey: workspaceKey("lin_secret") })
// @ts-expect-error workspace credentials cannot cross the Application boundary
new LineaApplicationClient({ applicationId: "app", applicationKey: workspaceKey("lin_secret") })
// @ts-expect-error Application credentials cannot cross the workspace boundary
new LineaWorkspaceClient({ workspaceKey: applicationKey("lin_app_secret") })
export { application, workspace, LineaClient, LineaUserClient, verifyWebhook, verifyWebhookSignature }
`
  )
  writeFileSync(
    join(temporary, "webhook.mjs"),
    `import { createHmac } from "node:crypto"
import { verifyWebhook } from "@linea/sdk/webhooks"
const secret = "webhook-secret"
const eventId = "event-1"
const now = new Date("2026-09-18T12:00:00.000Z")
const timestamp = String(now.getTime() / 1000)
const body = Buffer.from(JSON.stringify({ id: eventId, type: "execution.completed", version: 1, createdAt: now.toISOString(), applicationId: "application-1", data: { executionId: "00000000-0000-4000-8000-000000000001", status: "succeeded" } }))
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

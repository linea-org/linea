import { spawnSync } from "node:child_process"
import { config as loadEnv } from "dotenv"

loadEnv({ quiet: true })

const pnpmCli = process.env.npm_execpath
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli ?? "")
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
const checks = [
  ["format", ["format:check"]],
  ["lint", ["exec", "turbo", "lint", "--force"]],
  ["typecheck", ["exec", "turbo", "typecheck", "--force"]],
  ["build", ["exec", "turbo", "build", "--force"]],
  ["public contracts", ["check:contracts"]],
  ["database repositories", ["--filter", "@linea/db", "test"]],
  ["public protocol", ["--filter", "@linea/protocol", "test"]],
  ["connector operations", ["--filter", "@linea/connectors", "test"]],
  ["queue", ["--filter", "@linea/queue", "test"]],
  ["runtime", ["--filter", "@linea/runtime", "test"]],
  ["authentication", ["--filter", "@linea/auth", "test"]],
  ["browser SDK", ["--filter", "@linea/sdk", "test"]],
  ["React SDK", ["--filter", "@linea/sdk-react", "test"]],
  [
    "Platform API",
    ["--filter", "@linea/platform-api", "exec", "jest", "--runInBand"],
  ],
  [
    "execution worker",
    ["--filter", "@linea/execution-worker", "exec", "jest", "--runInBand"],
  ],
  [
    "background worker",
    ["--filter", "@linea/background-worker", "exec", "jest", "--runInBand"],
  ],
  [
    "queued Google and GitHub public-boundary tracer",
    [
      "--filter",
      "@linea/platform-api",
      "exec",
      "jest",
      "--config",
      "./test/jest-e2e.json",
      "--runInBand",
      "connections-launch.e2e-spec.ts",
    ],
  ],
  ["first-launch public boundary", ["test:launch"]],
  ["packed browser and server SDK", ["--filter", "@linea/sdk", "test:pack"]],
  ["packed React SDK", ["--filter", "@linea/sdk-react", "test:pack"]],
]

const missing = [
  ...(pnpmCli ? [] : ["pnpm"]),
  ...(process.env.DATABASE_URL ? [] : ["DATABASE_URL"]),
  ...(process.env.REDIS_URL ? [] : ["REDIS_URL"]),
]
if (missing.length) {
  process.stderr.write(
    `CONNECTIONS AND ACTION CONSENT LAUNCH GATE: FAIL (missing ${missing.join(", ")})\n`
  )
  process.exit(1)
}
for (const [name, arguments_] of checks) {
  process.stdout.write(`\nConnections launch gate: ${name}\n`)
  const result = spawnSync(pnpmCommand, pnpmArguments(arguments_), {
    stdio: "inherit",
    env: process.env,
  })
  if (result.error || result.status !== 0) {
    process.stderr.write(
      `\nCONNECTIONS AND ACTION CONSENT LAUNCH GATE: FAIL (${name})\n`
    )
    process.exit(result.status ?? 1)
  }
}
process.stdout.write("\nCONNECTIONS AND ACTION CONSENT LAUNCH GATE: PASS\n")

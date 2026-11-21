import { spawnSync } from "node:child_process"
import { config as loadEnv } from "dotenv"

loadEnv({
  path: new URL("../apps/platform-api/.env", import.meta.url),
  quiet: true,
})

const pnpmCli = process.env.npm_execpath
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli ?? "")
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
const tracer = [
  "queued Google and GitHub public-boundary tracer",
  [
    "--filter",
    "@linealabs/platform-api",
    "exec",
    "jest",
    "--config",
    "./test/jest-e2e.json",
    "--runInBand",
    "connections-launch.e2e-spec.ts",
  ],
]
const firstLaunch = ["first-launch public boundary", ["test:launch"]]
const fullChecks = [
  ["format", ["format:check"]],
  ["lint", ["exec", "turbo", "lint", "--force"]],
  ["typecheck", ["exec", "turbo", "typecheck", "--force"]],
  ["build", ["exec", "turbo", "build", "--force"]],
  ["public contracts", ["check:contracts"]],
  ["database repositories", ["--filter", "@linealabs/db", "test"]],
  ["public protocol", ["--filter", "@linealabs/protocol", "test"]],
  ["connector operations", ["--filter", "@linealabs/connectors", "test"]],
  ["queue", ["--filter", "@linealabs/queue", "test"]],
  ["runtime", ["--filter", "@linealabs/runtime", "test"]],
  ["authentication", ["--filter", "@linealabs/auth", "test"]],
  ["browser SDK", ["--filter", "@linealabs/sdk", "test"]],
  ["React SDK", ["--filter", "@linealabs/sdk-react", "test"]],
  [
    "Platform API",
    ["--filter", "@linealabs/platform-api", "exec", "jest", "--runInBand"],
  ],
  [
    "execution worker",
    ["--filter", "@linealabs/execution-worker", "exec", "jest", "--runInBand"],
  ],
  [
    "background worker",
    ["--filter", "@linealabs/background-worker", "exec", "jest", "--runInBand"],
  ],
  tracer,
  firstLaunch,
  [
    "packed browser and server SDK",
    ["--filter", "@linealabs/sdk", "test:pack"],
  ],
  ["packed React SDK", ["--filter", "@linealabs/sdk-react", "test:pack"]],
]

// CI's other required jobs already run format, lint, types, build, contracts, packed SDKs and every
// unit suite on the same commit, so --ci keeps only the end-to-end checks no other job covers.
const ciChecks = [
  [
    "build the API and workers the tracer starts",
    [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@linealabs/platform-api",
      "--filter=@linealabs/background-worker",
      "--filter=@linealabs/execution-worker",
    ],
  ],
  tracer,
  firstLaunch,
]
const checks = process.argv.includes("--ci") ? ciChecks : fullChecks

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

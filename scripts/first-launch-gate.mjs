import { spawnSync } from "node:child_process"

const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmCommand = pnpmCli.endsWith(".exe") ? pnpmCli : process.execPath
const pnpmArguments = (arguments_) =>
  pnpmCli.endsWith(".exe") ? arguments_ : [pnpmCli, ...arguments_]
const checks = [
  [
    "real OIDC, DPoP, public runtime, isolation, and races",
    [
      "--filter",
      "@linea/platform-api",
      "test",
      "--",
      "--runInBand",
      "src/launch-gate/first-launch.spec.ts",
    ],
  ],
  [
    "SSE reconnect and cursor expiry",
    [
      "--filter",
      "@linea/platform-api",
      "test",
      "--",
      "--runInBand",
      "src/public-runtime/end-user-events.spec.ts",
    ],
  ],
  [
    "approval timeout convergence",
    [
      "--filter",
      "@linea/background-worker",
      "test",
      "--",
      "--runInBand",
      "src/approvals/approval-timeout.service.spec.ts",
    ],
  ],
  [
    "Postgres outbox and BullMQ crash recovery",
    [
      "--filter",
      "@linea/background-worker",
      "test",
      "--",
      "--runInBand",
      "src/outbox/outbox-dispatcher.service.spec.ts",
    ],
  ],
  [
    "signed webhook retry and stable delivery identity",
    [
      "--filter",
      "@linea/background-worker",
      "test",
      "--",
      "--runInBand",
      "src/webhooks/webhook-delivery.service.spec.ts",
    ],
  ],
  [
    "webhook verification and receiver deduplication contract",
    ["--filter", "@linea/sdk", "test", "--", "src/webhooks.spec.ts"],
  ],
  ["headless React reconciliation", ["--filter", "@linea/sdk-react", "test"]],
  ["build browser SDK", ["--filter", "@linea/sdk", "build"]],
  ["verify vanilla browser package", ["--filter", "@linea/sdk", "test:pack"]],
  ["build React SDK", ["--filter", "@linea/sdk-react", "build"]],
  ["verify React package", ["--filter", "@linea/sdk-react", "test:pack"]],
]

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  process.stderr.write(
    "FIRST-LAUNCH APPROVAL PROTOCOL: FAIL\nDATABASE_URL and REDIS_URL are required\n"
  )
  process.exit(1)
}
for (const [name, arguments_] of checks) {
  process.stdout.write(`\nLaunch gate: ${name}\n`)
  const result = spawnSync(pnpmCommand, pnpmArguments(arguments_), {
    stdio: "inherit",
    env: process.env,
  })
  if (result.status !== 0) {
    process.stderr.write(`\nFIRST-LAUNCH APPROVAL PROTOCOL: FAIL (${name})\n`)
    process.exit(result.status ?? 1)
  }
}
process.stdout.write("\nFIRST-LAUNCH APPROVAL PROTOCOL: PASS\n")

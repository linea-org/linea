import { spawnSync } from "node:child_process"

const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli)
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
const jestTest = (packageName, testPath) => [
  "--filter",
  packageName,
  "test",
  "--",
  "--runInBand",
  testPath,
]
const checks = [
  [
    "build launch test dependencies",
    [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@linealabs/platform-api",
      "--filter=@linealabs/background-worker",
    ],
  ],
  [
    "real OIDC, DPoP, public runtime, isolation, and races",
    jestTest("@linealabs/platform-api", "src/launch-gate/first-launch.spec.ts"),
  ],
  [
    "SSE reconnect and cursor expiry",
    jestTest(
      "@linealabs/platform-api",
      "src/public-runtime/end-user-events.spec.ts"
    ),
  ],
  [
    "approval timeout convergence",
    jestTest(
      "@linealabs/background-worker",
      "src/approvals/approval-timeout.service.spec.ts"
    ),
  ],
  [
    "Postgres outbox and BullMQ crash recovery",
    jestTest(
      "@linealabs/background-worker",
      "src/outbox/outbox-dispatcher.service.spec.ts"
    ),
  ],
  [
    "signed webhook retry and stable delivery identity",
    jestTest(
      "@linealabs/background-worker",
      "src/webhooks/webhook-delivery.service.spec.ts"
    ),
  ],
  ["build browser SDK", ["--filter", "@linealabs/sdk", "build"]],
  [
    "webhook verification and receiver deduplication contract",
    ["--filter", "@linealabs/sdk", "test", "--", "src/webhooks.spec.ts"],
  ],
  [
    "headless React reconciliation",
    ["--filter", "@linealabs/sdk-react", "test"],
  ],
  [
    "verify vanilla browser package",
    ["--filter", "@linealabs/sdk", "test:pack"],
  ],
  ["build React SDK", ["--filter", "@linealabs/sdk-react", "build"]],
  ["verify React package", ["--filter", "@linealabs/sdk-react", "test:pack"]],
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

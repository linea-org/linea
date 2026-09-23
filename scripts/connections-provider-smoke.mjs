import { spawnSync } from "node:child_process"

const pnpmCli = process.env.npm_execpath
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli ?? "")
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
const providers = [
  [
    "Google",
    "test:google-live",
    [
      "GOOGLE_LIVE_ACCESS_TOKEN",
      "GOOGLE_LIVE_GMAIL_RECIPIENT",
      "GOOGLE_LIVE_CALENDAR_ID",
    ],
  ],
  [
    "GitHub",
    "test:github:live",
    ["GITHUB_LIVE_TOKEN", "GITHUB_LIVE_REPOSITORY"],
  ],
]

if (!pnpmCli) {
  process.stderr.write("CREDENTIALED PROVIDER SMOKE: FAIL (pnpm is required)\n")
  process.exit(1)
}
let failed = false
for (const [provider, script, credentials] of providers) {
  const missing = credentials.filter((name) => !process.env[name])
  if (missing.length) {
    process.stderr.write(`${provider}: FAIL (missing ${missing.join(", ")})\n`)
    failed = true
    continue
  }
  const result = spawnSync(
    pnpmCommand,
    pnpmArguments(["--filter", "@linea/connectors", script]),
    { stdio: "inherit", env: process.env }
  )
  if (result.error || result.status !== 0) {
    process.stderr.write(`${provider}: FAIL\n`)
    failed = true
  } else process.stdout.write(`${provider}: PASS\n`)
}
process[failed ? "stderr" : "stdout"].write(
  `CREDENTIALED PROVIDER SMOKE: ${failed ? "FAIL" : "PASS"}\n`
)
if (failed) process.exit(1)

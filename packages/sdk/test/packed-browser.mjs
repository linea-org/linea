import { execFileSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { buildSync } from "esbuild"

const repository = resolve(import.meta.dirname, "../../..")
const temporary = mkdtempSync(join(tmpdir(), "linealabs-sdk-browser-"))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmIsJavaScript = /\.(?:c|m)?js$/.test(pnpmCli)
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli
const pnpmArguments = (arguments_) =>
  pnpmIsJavaScript ? [pnpmCli, ...arguments_] : arguments_
try {
  execFileSync(
    pnpmCommand,
    pnpmArguments([
      "--filter",
      "@linealabs/protocol",
      "pack",
      "--pack-destination",
      temporary,
    ]),
    { cwd: repository, stdio: "inherit" }
  )
  execFileSync(
    pnpmCommand,
    pnpmArguments([
      "--filter",
      "@linealabs/sdk",
      "pack",
      "--pack-destination",
      temporary,
    ]),
    { cwd: repository, stdio: "inherit" }
  )
  const archives = readdirSync(temporary).filter((file) =>
    file.endsWith(".tgz")
  )
  const protocolArchive = archives.find((file) =>
    file.startsWith("linealabs-protocol-")
  )
  const sdkArchive = archives.find((file) => file.startsWith("linealabs-sdk-"))
  if (!protocolArchive || !sdkArchive)
    throw new Error("Packed archives are missing")
  cpSync(resolve(repository, "examples/sdk-browser"), temporary, {
    recursive: true,
  })
  const packageJson = JSON.parse(
    readFileSync(join(temporary, "package.json"), "utf8")
  )
  packageJson.dependencies["@linealabs/sdk"] =
    `file:${join(temporary, sdkArchive)}`
  packageJson.pnpm = {
    overrides: {
      "@linealabs/protocol": `file:${join(temporary, protocolArchive)}`,
    },
  }
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify(packageJson, null, 2)
  )
  execFileSync(
    pnpmCommand,
    pnpmArguments(["install", "--ignore-scripts", "--no-lockfile"]),
    { cwd: temporary, stdio: "inherit" }
  )
  const typescript = resolve(temporary, "node_modules/typescript/bin/tsc")
  execFileSync(process.execPath, [typescript, "--project", "tsconfig.json"], {
    cwd: temporary,
    stdio: "inherit",
  })
  buildSync({
    absWorkingDir: temporary,
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: "bundle.js",
  })
  const bundle = readFileSync(join(temporary, "bundle.js"), "utf8")
  if (!bundle.includes("/v1/user/approval-requests")) {
    throw new Error("Packed browser example omitted the public approval route")
  }
  for (const route of [
    "/v1/user/connections/authorizations/{authorizationId}",
    "/v1/user/connections/{connectionId}/authorizations",
    "/v1/user/connections/{connectionId}/uses",
  ]) {
    if (!bundle.includes(route)) {
      throw new Error(`Packed browser example omitted ${route}`)
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

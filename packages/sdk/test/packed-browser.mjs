import { execFileSync } from "node:child_process"
import {
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
const temporary = mkdtempSync(join(tmpdir(), "linea-sdk-browser-"))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmCommand = pnpmCli.endsWith(".exe") ? pnpmCli : process.execPath
const pnpmArguments = (arguments_) =>
  pnpmCli.endsWith(".exe") ? arguments_ : [pnpmCli, ...arguments_]
try {
  execFileSync(
    pnpmCommand,
    pnpmArguments([
      "--filter",
      "@linea/protocol",
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
      "@linea/sdk",
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
    join(temporary, "index.js"),
    'import { LineaUserClient } from "@linea/sdk/user"; export { LineaUserClient }'
  )
  execFileSync(
    pnpmCommand,
    pnpmArguments(["install", "--ignore-scripts", "--no-lockfile"]),
    { cwd: temporary, stdio: "inherit" }
  )
  buildSync({
    absWorkingDir: temporary,
    entryPoints: ["index.js"],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: "bundle.js",
  })
  const bundle = readFileSync(join(temporary, "bundle.js"), "utf8")
  if (!bundle.includes("LineaUserClient"))
    throw new Error("Packed browser bundle omitted the user client")
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

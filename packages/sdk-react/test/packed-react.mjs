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
const temporary = mkdtempSync(join(tmpdir(), "linea-sdk-react-"))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error("pnpm executable path is unavailable")
const pnpmCommand = pnpmCli.endsWith(".exe") ? pnpmCli : process.execPath
const pnpmArguments = (arguments_) =>
  pnpmCli.endsWith(".exe") ? arguments_ : [pnpmCli, ...arguments_]
const consumers = [
  {
    directory: "react",
    example: "examples/sdk-react",
    expected: "Linea approvals",
  },
  {
    directory: "copilotkit",
    example: "examples/sdk-react-copilotkit",
    expected: "linea_approval_request",
  },
]
try {
  for (const packageName of [
    "@linea/protocol",
    "@linea/sdk",
    "@linea/sdk-react",
  ]) {
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
  const sdkArchive = archives.find(
    (file) =>
      file.startsWith("linea-sdk-") && !file.startsWith("linea-sdk-react-")
  )
  const reactArchive = archives.find((file) =>
    file.startsWith("linea-sdk-react-")
  )
  if (!protocolArchive || !sdkArchive || !reactArchive) {
    throw new Error("Packed archives are missing")
  }
  for (const consumer of consumers) {
    const consumerDirectory = join(temporary, consumer.directory)
    cpSync(resolve(repository, consumer.example), consumerDirectory, {
      recursive: true,
    })
    const packageJson = JSON.parse(
      readFileSync(join(consumerDirectory, "package.json"), "utf8")
    )
    packageJson.dependencies["@linea/sdk"] =
      `file:${join(temporary, sdkArchive)}`
    packageJson.dependencies["@linea/sdk-react"] =
      `file:${join(temporary, reactArchive)}`
    packageJson.pnpm = {
      overrides: {
        "@linea/protocol": `file:${join(temporary, protocolArchive)}`,
        "@linea/sdk": `file:${join(temporary, sdkArchive)}`,
      },
    }
    writeFileSync(
      join(consumerDirectory, "package.json"),
      JSON.stringify(packageJson, null, 2)
    )
    execFileSync(
      pnpmCommand,
      pnpmArguments(["install", "--ignore-scripts", "--no-lockfile"]),
      { cwd: consumerDirectory, stdio: "inherit" }
    )
    const typescript = resolve(
      consumerDirectory,
      "node_modules/typescript/bin/tsc"
    )
    execFileSync(process.execPath, [typescript, "--project", "tsconfig.json"], {
      cwd: consumerDirectory,
      stdio: "inherit",
    })
    buildSync({
      absWorkingDir: consumerDirectory,
      entryPoints: ["src/main.tsx"],
      bundle: true,
      platform: "browser",
      format: "esm",
      loader: {
        ".ttf": "dataurl",
        ".woff": "dataurl",
        ".woff2": "dataurl",
      },
      outfile: "bundle.js",
    })
    const bundle = readFileSync(join(consumerDirectory, "bundle.js"), "utf8")
    if (!bundle.includes(consumer.expected)) {
      throw new Error(`${consumer.example} was not bundled`)
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"

function findWorkspaceRoot(start = process.cwd()) {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir
    const parent = resolve(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return start
}

const rootDir = findWorkspaceRoot()
const processDir = process.cwd()
const fileEnvironment: NodeJS.ProcessEnv = {}
const envFiles = [
  resolve(rootDir, ".env"),
  resolve(rootDir, ".env.local"),
  ...(processDir === rootDir
    ? []
    : [resolve(processDir, ".env"), resolve(processDir, ".env.local")]),
]
for (const path of envFiles) {
  loadEnv({ path, processEnv: fileEnvironment, override: true, quiet: true })
}
for (const [key, value] of Object.entries(fileEnvironment)) {
  if (process.env[key] === undefined) process.env[key] = value
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development"
}

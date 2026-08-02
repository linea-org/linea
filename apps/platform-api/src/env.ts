import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

function findWorkspaceRoot(start = process.cwd()) {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return start
}

const rootDir = findWorkspaceRoot()

loadEnv({ path: resolve(rootDir, '.env') })
loadEnv({ path: resolve(rootDir, '.env.local') })

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development'
}

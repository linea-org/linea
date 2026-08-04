/// <reference types="node" />

import { config as loadEnv } from "dotenv"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

loadEnv({ path: resolve(rootDir, ".env") })
loadEnv({ path: resolve(rootDir, ".env.local") })

export default defineConfig({
  test: {
    // Repository tests hit a real Postgres and roll back per test — they
    // share connections through one pool, so run them one file at a time.
    fileParallelism: false,
  },
})

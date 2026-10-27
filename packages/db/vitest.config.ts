/// <reference types="node" />

import "dotenv/config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Repository tests share one Postgres pool and roll back per test.
    fileParallelism: false,
  },
})

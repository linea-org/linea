/// <reference types="node" />

import "@linea/config/env"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Repository tests share one Postgres pool and roll back per test.
    fileParallelism: false,
  },
})

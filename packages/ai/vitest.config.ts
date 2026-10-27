/// <reference types="node" />

import "dotenv/config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // key-resolver tests hit a real Postgres via a rolled-back transaction.
    fileParallelism: false,
  },
})

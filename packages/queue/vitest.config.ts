/// <reference types="node" />

import "dotenv/config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Tests share one Redis connection/queue name — run one file at a time.
    fileParallelism: false,
  },
})

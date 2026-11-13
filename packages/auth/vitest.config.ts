/// <reference types="node" />

import "dotenv/config"
import { defineConfig } from "vitest/config"

// Auth specs hash passwords and drive Better Auth end to end, which exceeds 5 s on CI runners.
export default defineConfig({ test: { testTimeout: 30_000 } })

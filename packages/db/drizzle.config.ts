/// <reference types="node" />

import { config as loadEnv } from "dotenv"
import { defineConfig } from "drizzle-kit"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

loadEnv({ path: resolve(rootDir, ".env") })
loadEnv({ path: resolve(rootDir, ".env.local") })

export default defineConfig({
	schema: "./src/schema/**/*.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
})

import { Pool, type PoolConfig } from "pg"
import { getDatabaseUrl } from "./env.js"

export function createPool(config: PoolConfig = {}) {
  return new Pool({
    connectionString: getDatabaseUrl(),
    ...config,
  })
}

export const pool = createPool()

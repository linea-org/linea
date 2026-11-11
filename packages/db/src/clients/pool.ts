import { Pool } from "pg"
import { getDatabaseUrl } from "./env.js"

export function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    lock_timeout: 10_000,
    query_timeout: 65_000,
    idle_in_transaction_session_timeout: 60_000,
  })
}

export const pool = createPool()

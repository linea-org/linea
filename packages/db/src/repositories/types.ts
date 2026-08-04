import type { Database } from "../clients/index.js"

// Derived from Database's own transaction() signature rather than imported
// from drizzle-orm directly, so it always matches whatever Database actually is.
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export type DbClient = Database | Transaction

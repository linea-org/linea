import type { Database } from "../clients/index.js"

/** Derived from Database's own transaction() signature, so it always matches. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export type DbClient = Database | Transaction

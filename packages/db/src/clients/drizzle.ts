import { drizzle } from "drizzle-orm/node-postgres"
import { relations } from "../relations.js"
import { pool } from "./pool.js"

export const db = drizzle({
  client: pool,
  relations,
})

export type Database = typeof db

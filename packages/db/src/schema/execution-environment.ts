import { pgEnum } from "drizzle-orm/pg-core"

export const executionEnvironment = pgEnum("execution_environment", [
  "draft",
  "dev",
  "production",
])

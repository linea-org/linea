export function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize @linea/db")
  }

  return connectionString
}

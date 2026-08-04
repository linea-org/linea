export function getRedisUrl() {
  const url = process.env.REDIS_URL

  if (!url) {
    throw new Error("REDIS_URL is required to initialize @linea/queue")
  }

  return url
}

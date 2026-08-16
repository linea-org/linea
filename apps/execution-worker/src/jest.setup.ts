// BullMQ can duplicate the Redis connection it's given internally, and a duplicate doesn't inherit createConnection()'s own "error" listener (EventEmitter listeners aren't copied by ioredis's .duplicate()) — a stray "Connection is closed" error from that duplicate closing after an owning test's teardown otherwise crashes whatever test happens to be running next. Same benign race as connection.ts's own listener, caught here as the last line of defense for connections we don't create directly.
function isBenignRedisTeardownError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("Connection is closed")
  )
}

process.on("uncaughtException", (error: Error) => {
  if (isBenignRedisTeardownError(error)) return
  console.error(error)
  process.exit(1)
})

process.on("unhandledRejection", (reason: unknown) => {
  if (isBenignRedisTeardownError(reason)) return
  console.error(reason)
  process.exit(1)
})

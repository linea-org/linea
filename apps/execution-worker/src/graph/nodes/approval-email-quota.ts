import { createConnection } from "@linea/queue"

export async function consumeApprovalEmailQuota(
  workspaceId: string,
  recipientCount: number
): Promise<boolean> {
  const connection = createConnection()
  try {
    const now = Date.now()
    const result = await connection.eval(
      `local count = tonumber(ARGV[1])
       if tonumber(redis.call('GET', KEYS[1]) or '0') + count > 100
          or tonumber(redis.call('GET', KEYS[2]) or '0') + count > 1000 then
         return 0
       end
       redis.call('INCRBY', KEYS[1], count)
       redis.call('EXPIRE', KEYS[1], 3600)
       redis.call('INCRBY', KEYS[2], count)
       redis.call('EXPIRE', KEYS[2], 86400)
       return 1`,
      2,
      `approval-email:${workspaceId}:hour:${Math.floor(now / 3_600_000)}`,
      `approval-email:${workspaceId}:day:${Math.floor(now / 86_400_000)}`,
      recipientCount
    )
    return result === 1
  } finally {
    await connection.quit()
  }
}

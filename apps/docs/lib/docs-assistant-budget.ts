import { createHash } from "node:crypto"
import { z } from "zod"

const reserveScript = `
local day = math.floor(tonumber(redis.call('TIME')[1]) / 86400)
if redis.call('HGET', KEYS[1], 'day') ~= tostring(day) then
  redis.call('DEL', KEYS[1])
end
local total = tonumber(redis.call('HGET', KEYS[1], 'total') or '0')
if total >= tonumber(ARGV[2]) then return 0 end
local minute = math.floor(tonumber(redis.call('TIME')[1]) / 60)
local entry = redis.call('HGET', KEYS[1], ARGV[1])
local daily, window, recent = 0, minute, 0
if entry then
  daily, window, recent = string.match(entry, '^(%d+):(%d+):(%d+)$')
  daily, window, recent = tonumber(daily), tonumber(window), tonumber(recent)
end
if window ~= minute then recent = 0 end
if daily >= 50 or recent >= 10 then return 0 end
redis.call('HSET', KEYS[1], 'day', day, 'total', total + 1, ARGV[1], (daily + 1)..':'..minute..':'..(recent + 1))
redis.call('EXPIREAT', KEYS[1], (day + 1) * 86400)
return 1
`

export async function reserveDocsAssistantUsage(
  clientId: string,
  signal: AbortSignal
) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token || new URL(url).protocol !== "https:")
    throw new Error("Docs assistant budget storage is not configured.")
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .parse(process.env.DOCS_AI_DAILY_REQUEST_LIMIT ?? 1_000)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "EVAL",
      reserveScript,
      1,
      "{docs-assistant}:budget:v1",
      `client:${createHash("sha256").update(clientId).digest("hex")}`,
      limit,
    ]),
    signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
    redirect: "error",
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Docs assistant budget storage failed.")
  const result = z
    .object({ result: z.union([z.literal(0), z.literal(1)]) })
    .parse(await response.json())
  return result.result === 1
}

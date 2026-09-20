const CONTENT_LENGTH_PATTERN = /^\d+$/

export async function readBoundedResponseText(
  response: Response,
  maximumBytes: number
): Promise<string> {
  const declaredLength = response.headers.get("content-length")
  if (
    declaredLength &&
    CONTENT_LENGTH_PATTERN.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw new Error("Provider response exceeded limit")
  }
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      receivedBytes += result.value.byteLength
      if (receivedBytes > maximumBytes) {
        await reader.cancel()
        throw new Error("Provider response exceeded limit")
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, receivedBytes).toString("utf8")
}

export async function readBoundedJsonResponse(
  response: Response,
  maximumBytes: number
): Promise<unknown> {
  return JSON.parse(
    await readBoundedResponseText(response, maximumBytes)
  ) as unknown
}

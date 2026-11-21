import { describe, expect, it } from "vitest"
import { readableProviderError } from "./provider-error"

describe("readableProviderError", () => {
  it("explains a rejected key and keeps the provider's body as details", () => {
    const failure = readableProviderError(
      '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    )
    expect(failure?.summary).toBe("The model provider rejected the API key.")
    expect(failure?.details).toContain("invalid x-api-key")
  })

  it("passes on what the provider said when it refuses a request", () => {
    expect(
      readableProviderError(
        '429 {"error":{"message":"You have no credits remaining."}}'
      )?.summary
    ).toBe(
      "The model provider refused the request: You have no credits remaining."
    )
  })

  it("treats a server error as temporary", () => {
    expect(readableProviderError('503 {"message":"overloaded"}')?.summary).toBe(
      "The model provider had a temporary problem. Try again shortly."
    )
  })

  it("leaves messages that are not provider responses alone", () => {
    expect(readableProviderError("No OPENAI_API_KEY is set.")).toBeNull()
    expect(readableProviderError("401 not json")).toBeNull()
  })
})

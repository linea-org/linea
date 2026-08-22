/** Bypasses remaining retry budget — handlers classify e.g. a 4xx here. */
export class NonRetryableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "NonRetryableError"
  }
}

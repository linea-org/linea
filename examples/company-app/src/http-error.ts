export class HttpError extends Error {
  readonly status: number
  readonly headers: Record<string, string>
  constructor(
    status: number,
    message: string,
    headers: Record<string, string> = {}
  ) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

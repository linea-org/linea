import type { PublicErrorCode } from "@linea/protocol/errors"

export class LineaUserApiError extends Error {
  readonly code: PublicErrorCode
  readonly status: number
  readonly endpoint: string
  readonly retryAfter: number | undefined

  constructor(input: {
    code: PublicErrorCode
    status: number
    endpoint: string
    message: string
    retryAfter: number | undefined
  }) {
    super(input.message)
    this.name = "LineaUserApiError"
    this.code = input.code
    this.status = input.status
    this.endpoint = input.endpoint
    this.retryAfter = input.retryAfter
  }
}

export class LineaUserNetworkError extends Error {
  readonly endpoint: string
  override readonly cause: unknown

  constructor(endpoint: string, cause: unknown) {
    super(`Network error calling ${endpoint}: ${String(cause)}`)
    this.name = "LineaUserNetworkError"
    this.endpoint = endpoint
    this.cause = cause
  }
}

export class LineaUserProtocolError extends Error {
  readonly endpoint: string
  override readonly cause: unknown

  constructor(endpoint: string, cause: unknown) {
    super(`Invalid response from ${endpoint}`)
    this.name = "LineaUserProtocolError"
    this.endpoint = endpoint
    this.cause = cause
  }
}

export class LineaUserSessionError extends Error {
  readonly code: "session_expired" | "session_unavailable"

  constructor(code: "session_expired" | "session_unavailable") {
    super(
      code === "session_expired"
        ? "End-user session expired"
        : "End-user session is unavailable"
    )
    this.name = "LineaUserSessionError"
    this.code = code
  }
}

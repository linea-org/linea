import type {
  PublicErrorCode,
  PublicErrorResponse,
} from '@linealabs/protocol/errors'

export function publicError(
  code: PublicErrorCode,
  message: string,
): PublicErrorResponse {
  return { error: { code, message } }
}

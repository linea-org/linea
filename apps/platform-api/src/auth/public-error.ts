import type {
  PublicErrorCode,
  PublicErrorResponse,
} from '@linea/protocol/errors'

export function publicError(
  code: PublicErrorCode,
  message: string,
): PublicErrorResponse {
  return { error: { code, message } }
}

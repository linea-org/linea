import { connectionBrowserMessageSchema } from "@linea/protocol/resources"
import type {
  ConnectionAuthorizationResponse,
  LaunchConnectionAuthorization,
} from "@linea/protocol/resources"

export function openConnectionAuthorization(
  authorization: ConnectionAuthorizationResponse,
  popup: { location: Pick<Location, "href">; closed: boolean; close(): void },
  launch: (
    input: LaunchConnectionAuthorization
  ) => Promise<ConnectionAuthorizationResponse>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const origin = new URL(authorization.authorizationUrl).origin
    const cleanup = () => {
      window.removeEventListener("message", receive)
      clearInterval(timer)
    }
    const fail = (error: unknown) => {
      cleanup()
      popup.close()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== popup || event.origin !== origin) return
      const parsed = connectionBrowserMessageSchema.safeParse(event.data)
      if (
        !parsed.success ||
        parsed.data.authorizationId !== authorization.authorizationId
      )
        return
      cleanup()
      void launch({
        state: parsed.data.state,
        browserChallenge: parsed.data.browserChallenge,
      })
        .then((result) => {
          popup.location.href = result.authorizationUrl
          resolve()
        })
        .catch(fail)
    }
    const expiresAt = Date.now() + 300_000
    const timer = setInterval(() => {
      if (popup.closed || Date.now() >= expiresAt)
        fail(new Error("Connection authorization cancelled or expired"))
    }, 250)
    window.addEventListener("message", receive)
    try {
      popup.location.href = authorization.authorizationUrl
    } catch (error) {
      fail(error)
    }
  })
}

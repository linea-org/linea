import { afterEach, expect, it, vi } from "vitest"
import { openConnectionAuthorization } from "./open-connection-authorization.js"

const authorization = {
  authorizationId: "60000000-0000-4000-8000-000000000006",
  authorizationUrl:
    "https://api.example/v1/user/connections/oauth/github/launch?state=secret",
}
const message = {
  kind: "linea-connection-browser",
  authorizationId: authorization.authorizationId,
  state: "secret",
  browserChallenge: "a".repeat(64),
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it("requires the API origin, popup source, and authorization id before sending DPoP launch", async () => {
  const windowEvents = new EventTarget()
  vi.stubGlobal("window", windowEvents)
  const channel = new MessageChannel()
  const popup = Object.assign(channel.port1, {
    location: { href: "" },
    closed: false,
  })
  const launch = vi.fn().mockResolvedValue({
    ...authorization,
    authorizationUrl: "https://github.com/login/oauth/authorize",
  })
  const opened = openConnectionAuthorization(authorization, popup, launch)
  expect(popup.location.href).toBe(authorization.authorizationUrl)
  const send = (origin: string, source: MessagePort, data: unknown) =>
    windowEvents.dispatchEvent(
      new MessageEvent("message", { origin, source, data })
    )
  send("https://attacker.example", popup, message)
  send("https://api.example", channel.port2, message)
  send("https://api.example", popup, {
    ...message,
    authorizationId: "70000000-0000-4000-8000-000000000007",
  })
  expect(launch).not.toHaveBeenCalled()
  send("https://api.example", popup, message)
  await opened
  expect(launch).toHaveBeenCalledExactlyOnceWith({
    state: "secret",
    browserChallenge: message.browserChallenge,
  })
  expect(popup.location.href).toBe("https://github.com/login/oauth/authorize")
  send("https://api.example", popup, message)
  expect(launch).toHaveBeenCalledTimes(1)
  channel.port1.close()
  channel.port2.close()
})

it.each(["cancel", "expire"])(
  "rejects a pending launch on %s and ignores its late result",
  async (kind) => {
    vi.useFakeTimers()
    const windowEvents = new EventTarget()
    vi.stubGlobal("window", windowEvents)
    const channel = new MessageChannel()
    const popup = Object.assign(channel.port1, {
      location: { href: "" },
      closed: false,
    })
    let finish: ((value: typeof authorization) => void) | undefined
    const launch = vi.fn(
      () =>
        new Promise<typeof authorization>((resolve) => {
          finish = resolve
        })
    )
    const opened = openConnectionAuthorization(authorization, popup, launch)
    const rejected = expect(opened).rejects.toThrow("cancelled or expired")
    windowEvents.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://api.example",
        source: popup,
        data: message,
      })
    )
    expect(launch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    if (kind === "cancel") popup.closed = true
    await vi.advanceTimersByTimeAsync(kind === "cancel" ? 250 : 300_000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    if (!finish) throw new Error("Launch request did not start")
    finish({ ...authorization, authorizationUrl: "https://github.com/late" })
    await vi.runAllTimersAsync()
    expect(popup.location.href).toBe(authorization.authorizationUrl)
    channel.port1.close()
    channel.port2.close()
  }
)

it.each(["cancel", "expire"])(
  "cleans up a browser handshake on %s",
  async (kind) => {
    vi.useFakeTimers()
    const windowEvents = new EventTarget()
    vi.stubGlobal("window", windowEvents)
    const popup = { location: { href: "" }, closed: false, close: vi.fn() }
    const launch = vi.fn()
    const opened = openConnectionAuthorization(authorization, popup, launch)
    const rejected = expect(opened).rejects.toThrow("cancelled or expired")
    if (kind === "cancel") popup.closed = true
    await vi.advanceTimersByTimeAsync(kind === "cancel" ? 250 : 300_000)
    await rejected
    expect(popup.close).toHaveBeenCalledOnce()
    expect(launch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  }
)

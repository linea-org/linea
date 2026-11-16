const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
]

/** A short "Chrome on macOS" name for a session's user agent. */
export function deviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return { name: "Unknown device", mobile: false }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const name =
    browser && system
      ? `${browser} on ${system}`
      : (browser ?? system ?? "Unknown device")
  return { name, mobile: /Mobile|Android|iPhone/.test(userAgent) }
}

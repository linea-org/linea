import { describe, expect, it } from "vitest"
import { resolveBaseUrl } from "./base-url.js"

describe("resolveBaseUrl", () => {
  it("defaults to the hosted API", () => {
    expect(resolveBaseUrl(undefined)).toBe("https://api.getlinea.app")
  })

  it("keeps an https origin and drops a trailing slash", () => {
    expect(resolveBaseUrl("https://linea.example.com/")).toBe(
      "https://linea.example.com"
    )
  })

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("allows plain http to the loopback server %s", (url) => {
    expect(resolveBaseUrl(url)).toBe(url)
  })

  it.each([
    "http://linea.example.com",
    "http://10.0.0.5:3000",
    "ftp://linea.example.com",
  ])("refuses %s so keys never travel unencrypted", (url) => {
    expect(() => resolveBaseUrl(url)).toThrow(TypeError)
  })

  it("refuses a value that is not a URL", () => {
    expect(() => resolveBaseUrl("api.getlinea.app")).toThrow(TypeError)
  })
})

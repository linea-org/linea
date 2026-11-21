import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const assetLinks = z
  .array(
    z.object({
      relation: z.array(z.string()),
      target: z.object({
        namespace: z.literal("android_app"),
        package_name: z.string(),
        sha256_cert_fingerprints: z
          .array(z.string().regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/))
          .min(1),
      }),
    })
  )
  .length(1)

describe("assetlinks.json", () => {
  it("lets the Android app open platform links and lists a valid certificate fingerprint", () => {
    const parsed = assetLinks.parse(
      JSON.parse(
        readFileSync(
          new URL("../../public/.well-known/assetlinks.json", import.meta.url),
          "utf8"
        )
      )
    )
    expect(parsed[0].relation).toContain(
      "delegate_permission/common.handle_all_urls"
    )
    expect(parsed[0].target.package_name).toBe("app.getlinea.mobile")
  })
})

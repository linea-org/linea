import type { LookupAddress } from "node:dns"
import {
  isPublicAddress,
  sendWebhookRequest,
  validateWebhookTarget,
  type AddressResolver,
  type WebhookRequester,
} from "./webhook-request"

describe("webhook request SSRF protection", () => {
  const publicAddress: LookupAddress = {
    address: "93.184.216.34",
    family: 4,
  }

  it("rejects private, loopback, link-local, and mixed DNS answers", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "::1",
      "::ffff:127.0.0.1",
      "0:0:0:0:0:ffff:7f00:1",
      "0:0:0:0:0:ffff:a00:1",
      "64:ff9b::a9fe:a9fe",
      "fd00::1",
    ]) {
      await expect(
        validateWebhookTarget(
          new URL("https://receiver.example/hook"),
          false,
          () =>
            Promise.resolve([
              { address, family: address.includes(":") ? 6 : 4 },
            ])
        )
      ).rejects.toThrow("non-public")
    }
    await expect(
      validateWebhookTarget(
        new URL("https://receiver.example/hook"),
        false,
        () =>
          Promise.resolve([publicAddress, { address: "127.0.0.1", family: 4 }])
      )
    ).rejects.toThrow("non-public")
    expect(isPublicAddress(publicAddress.address)).toBe(true)
    expect(isPublicAddress("0:0:0:0:0:ffff:5db8:d822")).toBe(true)
    expect(isPublicAddress("64:ff9b::5db8:d822")).toBe(true)
  })

  it("requires HTTPS outside local development", async () => {
    await expect(
      validateWebhookTarget(
        new URL("http://receiver.example/hook"),
        false,
        () => Promise.resolve([publicAddress])
      )
    ).rejects.toThrow("must use HTTPS")
  })

  it("revalidates every redirect before connecting", async () => {
    const resolver: AddressResolver = (hostname) =>
      Promise.resolve(
        hostname === "receiver.example"
          ? [publicAddress]
          : [{ address: "169.254.169.254", family: 4 }]
      )
    const requester: WebhookRequester = jest.fn(() =>
      Promise.resolve({
        response: { status: 302, body: "" },
        location: "https://metadata.internal/latest",
      })
    )
    await expect(
      sendWebhookRequest(
        {
          url: "https://receiver.example/hook",
          headers: {},
          body: Buffer.from("{}"),
          allowLocalDevelopment: false,
        },
        resolver,
        requester
      )
    ).rejects.toThrow("non-public")
    expect(requester).toHaveBeenCalledTimes(1)
  })
})

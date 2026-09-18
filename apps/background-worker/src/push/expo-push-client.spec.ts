import {
  ExpoTransportError,
  getExpoPushReceipt,
  sendExpoPush,
} from "./expo-push-client"

const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock
})

it("returns Expo tickets and receipts", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket" }] }))
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { ticket: { status: "ok", details: {} } } })
      )
    )
  await expect(
    sendExpoPush({
      to: "ExponentPushToken[test]",
      title: "Title",
      body: "Body",
      data: { screen: "execution" },
    })
  ).resolves.toEqual({ status: "ok", id: "ticket" })
  await expect(getExpoPushReceipt("ticket")).resolves.toEqual({ status: "ok" })
})

it("surfaces device errors and classifies retryable transport failures", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              status: "error",
              message: "Device is gone",
              details: { error: "DeviceNotRegistered" },
            },
          ],
        })
      )
    )
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
  await expect(
    sendExpoPush({
      to: "ExponentPushToken[gone]",
      title: "Title",
      body: "Body",
      data: {},
    })
  ).resolves.toEqual({
    status: "error",
    message: "Device is gone",
    code: "DeviceNotRegistered",
  })
  await expect(getExpoPushReceipt("ticket")).rejects.toMatchObject({
    transient: true,
  } satisfies Partial<ExpoTransportError>)
})

import type { Notification, PushDelivery } from "@linea/db"
import {
  ExpoTransportError,
  getExpoPushReceipt,
  sendExpoPush,
} from "./expo-push-client"
import { PushDeliveryService } from "./push-delivery.service"

const mockClaimDelivery = jest.fn<Promise<unknown>, unknown[]>()
const mockClaimReceipt = jest.fn<Promise<unknown>, unknown[]>()
const mockComplete = jest.fn<Promise<unknown>, unknown[]>()
const mockPermanentFailure = jest.fn<Promise<unknown>, unknown[]>()
const mockRecordTicket = jest.fn<Promise<unknown>, unknown[]>()
const mockRetryDelivery = jest.fn<Promise<unknown>, unknown[]>()
const mockRetryReceipt = jest.fn<Promise<unknown>, unknown[]>()

jest.mock("@linea/db", () => ({
  db: {},
  repositories: {
    pushNotification: {
      claimPushDelivery: (...args: unknown[]) => mockClaimDelivery(...args),
      claimPushReceipt: (...args: unknown[]) => mockClaimReceipt(...args),
      completePushDelivery: (...args: unknown[]) => mockComplete(...args),
      permanentlyFailPushDelivery: (...args: unknown[]) =>
        mockPermanentFailure(...args),
      recordPushTicket: (...args: unknown[]) => mockRecordTicket(...args),
      retryPushDelivery: (...args: unknown[]) => mockRetryDelivery(...args),
      retryPushReceipt: (...args: unknown[]) => mockRetryReceipt(...args),
    },
  },
}))

jest.mock("./expo-push-client", () => ({
  ExpoTransportError: class extends Error {
    constructor(
      message: string,
      readonly transient: boolean
    ) {
      super(message)
    }
  },
  getExpoPushReceipt: jest.fn(),
  sendExpoPush: jest.fn(),
}))

const sendMock = jest.mocked(sendExpoPush)
const receiptMock = jest.mocked(getExpoPushReceipt)

function delivery(overrides: Partial<PushDelivery> = {}): PushDelivery {
  return {
    id: "delivery-id",
    notificationId: "notification-id",
    deviceRegistrationId: "device-id",
    status: "sending",
    attempts: 1,
    receiptAttempts: 0,
    ticketId: null,
    lastError: null,
    nextAttemptAt: new Date(),
    claimedAt: new Date(),
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function notification(): Notification {
  return {
    id: "notification-id",
    userId: "user-id",
    actorUserId: null,
    workspaceId: "workspace-id",
    type: "execution.failed",
    severity: "error",
    title: "unsafe title",
    body: "unsafe body",
    href: null,
    metadata: { executionId: "execution-id" },
    read: false,
    readAt: null,
    archivedAt: null,
    createdAt: new Date(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockClaimDelivery.mockResolvedValue(undefined)
  mockClaimReceipt.mockResolvedValue(undefined)
})

it("removes a device after Expo permanently rejects its ticket", async () => {
  const rejected = delivery()
  mockClaimDelivery
    .mockResolvedValueOnce({
      delivery: rejected,
      notification: notification(),
      token: "ExponentPushToken[gone]",
    })
    .mockResolvedValueOnce(undefined)
  sendMock.mockResolvedValue({
    status: "error",
    message: "Device is gone",
    code: "DeviceNotRegistered",
  })
  await new PushDeliveryService().poll()
  expect(mockPermanentFailure).toHaveBeenCalledWith(
    expect.anything(),
    rejected,
    "DeviceNotRegistered: Device is gone",
    true
  )
})

it("retains a device when Expo reports a provider configuration error", async () => {
  const rejected = delivery()
  mockClaimDelivery
    .mockResolvedValueOnce({
      delivery: rejected,
      notification: notification(),
      token: "ExponentPushToken[valid]",
    })
    .mockResolvedValueOnce(undefined)
  sendMock.mockResolvedValue({
    status: "error",
    message: "Credentials are invalid",
    code: "InvalidCredentials",
  })
  await new PushDeliveryService().poll()
  expect(mockPermanentFailure).toHaveBeenCalledWith(
    expect.anything(),
    rejected,
    "InvalidCredentials: Credentials are invalid",
    false
  )
})

it("retries transient sends and receipt checks", async () => {
  const sending = delivery()
  const receipt = delivery({
    status: "receipt_checking",
    ticketId: "ticket-id",
    receiptAttempts: 1,
  })
  mockClaimDelivery
    .mockResolvedValueOnce({
      delivery: sending,
      notification: notification(),
      token: "ExponentPushToken[busy]",
    })
    .mockResolvedValueOnce(undefined)
  mockClaimReceipt
    .mockResolvedValueOnce(receipt)
    .mockResolvedValueOnce(undefined)
  sendMock.mockRejectedValue(new ExpoTransportError("busy", true))
  receiptMock.mockResolvedValue({
    status: "error",
    message: "slow down",
    code: "MessageRateExceeded",
  })
  await new PushDeliveryService().poll()
  expect(mockRetryDelivery).toHaveBeenCalledWith(
    expect.anything(),
    sending,
    "busy",
    expect.any(Date)
  )
  expect(mockRetryReceipt).toHaveBeenCalledWith(
    expect.anything(),
    receipt,
    "MessageRateExceeded: slow down",
    expect.any(Date)
  )
})

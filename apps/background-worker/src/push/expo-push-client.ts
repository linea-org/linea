export type ExpoPushPayload = {
  to: string
  title: string
  body: string
  data: Record<string, string>
}

type ExpoErrorResult = { status: "error"; message: string; code?: string }

export type ExpoPushTicketResult =
  | { status: "ok"; id: string }
  | ExpoErrorResult

export type ExpoPushReceiptResult = { status: "ok" } | ExpoErrorResult

export class ExpoTransportError extends Error {
  constructor(
    message: string,
    readonly transient: boolean
  ) {
    super(message)
  }
}

type ExpoResponse = { data?: unknown }

async function request(url: string, body: unknown): Promise<ExpoResponse> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new ExpoTransportError(
      error instanceof Error ? error.message : String(error),
      true
    )
  }
  if (!response.ok) {
    throw new ExpoTransportError(
      `Expo returned HTTP ${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
    )
  }
  const parsed: unknown = await response.json()
  if (!parsed || typeof parsed !== "object") {
    throw new ExpoTransportError("Expo returned an invalid response", true)
  }
  return parsed
}

function parseError(value: object): ExpoErrorResult {
  const message =
    "message" in value && typeof value.message === "string"
      ? value.message
      : "Expo rejected the notification"
  const code =
    "details" in value &&
    value.details &&
    typeof value.details === "object" &&
    "error" in value.details &&
    typeof value.details.error === "string"
      ? value.details.error
      : undefined
  return { status: "error", message, code }
}

function parseTicket(value: unknown): ExpoPushTicketResult {
  if (!value || typeof value !== "object" || !("status" in value)) {
    throw new ExpoTransportError("Expo returned an invalid result", true)
  }
  if (value.status === "ok" && "id" in value && typeof value.id === "string") {
    return { status: "ok", id: value.id }
  }
  if (value.status === "error") {
    return parseError(value)
  }
  throw new ExpoTransportError("Expo returned an invalid result", true)
}

function parseReceipt(value: unknown): ExpoPushReceiptResult {
  if (!value || typeof value !== "object" || !("status" in value)) {
    throw new ExpoTransportError("Expo returned an invalid result", true)
  }
  if (value.status === "ok") return { status: "ok" }
  if (value.status === "error") return parseError(value)
  throw new ExpoTransportError("Expo returned an invalid result", true)
}

export async function sendExpoPush(
  payload: ExpoPushPayload
): Promise<ExpoPushTicketResult> {
  const response = await request("https://exp.host/--/api/v2/push/send", [
    payload,
  ])
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ExpoTransportError(
      "Expo returned an invalid ticket response",
      true
    )
  }
  return parseTicket(response.data[0])
}

export async function getExpoPushReceipt(
  ticketId: string
): Promise<ExpoPushReceiptResult | undefined> {
  const response = await request(
    "https://exp.host/--/api/v2/push/getReceipts",
    { ids: [ticketId] }
  )
  if (!response.data || typeof response.data !== "object") {
    throw new ExpoTransportError(
      "Expo returned an invalid receipt response",
      true
    )
  }
  const receipt = (response.data as Record<string, unknown>)[ticketId]
  return receipt ? parseReceipt(receipt) : undefined
}

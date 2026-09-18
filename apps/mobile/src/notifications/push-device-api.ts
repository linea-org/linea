import { Platform } from "react-native"

export async function registerPushDevice(input: {
  baseUrl: string
  cookie: string
  token: string
  platform: "android" | "ios"
}): Promise<void> {
  const response = await fetch(`${input.baseUrl}/v1/push-devices`, {
    method: "POST",
    credentials: Platform.OS === "web" ? "include" : "omit",
    headers: {
      "content-type": "application/json",
      ...(Platform.OS !== "web" && input.cookie
        ? { cookie: input.cookie }
        : {}),
    },
    body: JSON.stringify({ token: input.token, platform: input.platform }),
  })
  if (!response.ok) {
    throw new Error(`Push device registration failed (${response.status})`)
  }
}

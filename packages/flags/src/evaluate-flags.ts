import {
  createFlagOverridesFromMap,
  getClient,
  OverrideBehaviour,
  PollingMode,
  User,
  type IConfigCatClient,
} from "@configcat/sdk"
import { FLAGS, type FlagKey } from "./flag-definitions.js"

// Checked on import, so a production process without a key fails at startup, not on its first flag.
if (process.env.NODE_ENV === "production" && !process.env.CONFIGCAT_SDK_KEY) {
  throw new Error("CONFIGCAT_SDK_KEY is required in production")
}

let client: IConfigCatClient | undefined

function localFlagValues(): Record<string, boolean> {
  const enabled = (process.env.FEATURE_FLAGS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
  const unknown = enabled.filter((key) => !(key in FLAGS))
  if (unknown.length > 0) {
    throw new Error(`FEATURE_FLAGS names unknown flags: ${unknown.join(", ")}`)
  }
  return Object.fromEntries(
    Object.entries(FLAGS).map(([key, flag]) => [
      key,
      enabled.includes(key) || flag.default,
    ])
  )
}

function flagClient(): IConfigCatClient {
  if (client) return client
  const sdkKey = process.env.CONFIGCAT_SDK_KEY
  if (sdkKey) {
    client = getClient(sdkKey, PollingMode.AutoPoll)
  } else {
    // LocalOnly never contacts ConfigCat, so the SDK accepts a placeholder key.
    client = getClient("local", PollingMode.ManualPoll, {
      flagOverrides: createFlagOverridesFromMap(
        localFlagValues(),
        OverrideBehaviour.LocalOnly
      ),
    })
  }
  return client
}

export async function isFlagEnabled(
  key: FlagKey,
  workspaceId: string
): Promise<boolean> {
  const enabled = await flagClient().getValueAsync(
    key,
    FLAGS[key].default,
    new User(workspaceId)
  )
  return enabled
}

export async function evaluateFlags(
  workspaceId: string
): Promise<Record<string, boolean>> {
  const user = new User(workspaceId)
  const entries = await Promise.all(
    Object.entries(FLAGS).map(
      async ([key, flag]) =>
        [
          key,
          await flagClient().getValueAsync(key, flag.default, user),
        ] as const
    )
  )
  return Object.fromEntries(entries)
}

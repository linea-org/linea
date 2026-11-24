import {
  EvaluationErrorCode,
  getClient,
  PollingMode,
  User,
  type IConfigCatClient,
} from "@configcat/sdk"
import { FLAG_KEYS, type FlagKey } from "./flag-definitions.js"

// Checked on import, so a production process without a key fails at startup, not on its first flag.
if (process.env.NODE_ENV === "production" && !process.env.CONFIGCAT_SDK_KEY) {
  throw new Error("CONFIGCAT_SDK_KEY is required in production")
}

let client: IConfigCatClient | undefined

/** Undefined without an SDK key, as in CI and for contributors; every flag is then off. */
function flagClient(): IConfigCatClient | undefined {
  const sdkKey = process.env.CONFIGCAT_SDK_KEY
  if (!client && sdkKey) client = getClient(sdkKey, PollingMode.AutoPoll)
  return client
}

export async function isFlagEnabled(
  key: FlagKey,
  workspaceId: string
): Promise<boolean> {
  // The SDK asks for a value to use before its first successful fetch; that is always off.
  return (
    (await flagClient()?.getValueAsync(key, false, new User(workspaceId))) ??
    false
  )
}

export async function evaluateFlags(
  workspaceId: string
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    FLAG_KEYS.map(
      async (key) => [key, await isFlagEnabled(key, workspaceId)] as const
    )
  )
  return Object.fromEntries(entries)
}

/** In production, refuses to start while ConfigCat lacks a flag; an outage of ConfigCat does not. */
export async function assertFlagsExist(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return
  const checks = await Promise.all(
    FLAG_KEYS.map(
      async (key) => await flagClient()?.getValueDetailsAsync(key, false)
    )
  )
  const missing = checks.filter(
    (check) =>
      check?.errorCode === EvaluationErrorCode.SettingKeyMissing ||
      check?.errorCode === EvaluationErrorCode.SettingValueTypeMismatch
  )
  if (missing.length > 0) {
    throw new Error(
      `ConfigCat has no on/off flag named: ${missing.map((check) => check?.key).join(", ")}`
    )
  }
}

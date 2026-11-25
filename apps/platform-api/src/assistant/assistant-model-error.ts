/** The workspace has not finished setting up a model; the message is safe to show as is. */
export class AssistantModelUnavailableError extends Error {}

/** The HTTP status the provider SDKs attach to their API errors; other failures have none. */
export function providerStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null
  }
  return typeof error.status === 'number' ? error.status : null
}

/** Groq refuses a whole answer whose tool call it can't match to a tool; asking again often works. */
export function isRefusedToolCall(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'tool_use_failed'
  )
}

/** What a provider's rejection means for the member, or null for a status we have no advice for. */
export function describeProviderFailure(
  status: number,
  provider: string,
): string | null {
  if (status === 401 || status === 403) {
    return `${provider} rejected the API key. Check it in Settings → Models.`
  }
  if (status === 404) {
    return `${provider} does not offer this model to your key. Pick another model.`
  }
  if (status === 429) {
    return `${provider} is limiting this key, or it is out of credit. Try again shortly or check your plan.`
  }
  if (status === 400) {
    return `${provider} could not handle that request. Try again, or pick another model.`
  }
  if (status >= 500) {
    return `${provider} is having trouble right now. Try again in a moment.`
  }
  return null
}

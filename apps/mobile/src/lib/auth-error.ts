export function authErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message
    if (typeof message === "string" && message) return message
  }
  return fallback
}

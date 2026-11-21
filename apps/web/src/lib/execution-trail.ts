/** The cursors of earlier pages, each URI-encoded so a `;` inside one cannot split it. */
export function encodeTrail(cursors: string[]): string | undefined {
  return cursors.length > 0
    ? cursors.map(encodeURIComponent).join(";")
    : undefined
}

/** Undefined for a value that is not a trail this page wrote. */
export function decodeTrail(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined
  try {
    return value.split(";").map(decodeURIComponent)
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
}

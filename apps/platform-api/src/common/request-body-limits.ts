// Explicit so a library default change cannot silently raise the request size cap.
export const REQUEST_BODY_LIMITS = {
  json: { limit: '128kb' },
  urlencoded: { limit: '16kb' },
}

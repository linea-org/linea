export function getAppOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  return (
    import.meta.env.VITE_APP_URL?.replace(/\/$/, "") || "http://localhost:3001"
  )
}

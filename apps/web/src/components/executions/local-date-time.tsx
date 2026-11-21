import { useHydrated } from "@tanstack/react-router"

/** Shows the ISO value until hydration: the server's locale and time zone differ from the browser's. */
export function LocalDateTime({ value }: Readonly<{ value: string }>) {
  const hydrated = useHydrated()
  return (
    <time dateTime={value}>
      {hydrated ? new Date(value).toLocaleString() : value}
    </time>
  )
}

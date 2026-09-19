"use client"

import { gitConfig } from "@/lib/shared"
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch"
import { Star } from "lucide-react"
import { useEffect, useState } from "react"

function formatStarCount(count: number) {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
}

function readStarCount(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("stargazers_count" in value) ||
    typeof value.stargazers_count !== "number"
  )
    return
  return value.stargazers_count
}

export function DocsSidebarFooter() {
  const [stars, setStars] = useState<number>()
  useEffect(() => {
    let active = true
    void fetch(
      `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`,
      { headers: { Accept: "application/vnd.github+json" } }
    )
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: unknown) => {
        const count = readStarCount(value)
        if (active && count != null) setStars(count)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return (
    <div className="border-fd-border flex w-full items-center gap-2 border-t px-3 py-2.5">
      <a
        href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
        target="_blank"
        rel="noreferrer"
        className="hover:bg-fd-accent text-fd-muted-foreground hover:text-fd-foreground flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-xs"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-current"
          aria-hidden="true"
        >
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
        <span className="truncate">
          {gitConfig.user}/{gitConfig.repo}
        </span>
        {stars != null && (
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <Star className="size-3" />
            {formatStarCount(stars)}
          </span>
        )}
      </a>
      <ThemeSwitch />
    </div>
  )
}

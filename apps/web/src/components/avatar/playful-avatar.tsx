import { createElement, useEffect, useState } from "react"

import { cn } from "@linea/ui/lib/utils"

export const PLAYFUL_AVATAR_COLORS = "#0a0310,#49007e,#ff005b,#ff7d10,#ffb238"

export type PlayfulAvatarVariant =
  | "beam"
  | "marble"
  | "pixel"
  | "sunset"
  | "ring"
  | "bauhaus"

type PlayfulAvatarProps = {
  name: string
  variant?: PlayfulAvatarVariant
  className?: string
  /** Circle for people, rounded square for workspaces. */
  shape?: "circle" | "rounded"
}

export function PlayfulAvatar({
  name,
  variant = "beam",
  className,
  shape = "circle",
}: PlayfulAvatarProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void import("playful-avatars").then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const shapeClass =
    shape === "circle"
      ? "rounded-full [&::part(svg)]:rounded-full"
      : "rounded-xl [&::part(svg)]:rounded-xl"

  if (!ready) {
    return (
      <span
        aria-hidden
        className={cn("inline-block shrink-0 bg-muted", shapeClass, className)}
      />
    )
  }

  return createElement("playful-avatar", {
    name,
    variant,
    colors: PLAYFUL_AVATAR_COLORS,
    className: cn(
      "inline-block shrink-0 overflow-hidden",
      shapeClass,
      className
    ),
  })
}

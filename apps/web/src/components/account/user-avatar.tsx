import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@linea/ui/components/avatar"
import { cn } from "@linea/ui/lib/utils"

import { PlayfulAvatar } from "../avatar"

const sizeClass = {
  sm: "size-6",
  default: "size-8",
  lg: "size-10",
} as const

type UserAvatarProps = {
  name?: string | null
  email?: string | null
  image?: string | null
  size?: keyof typeof sizeClass
  className?: string
}

export function userInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export function UserAvatar({
  name,
  email,
  image,
  size = "default",
  className,
}: UserAvatarProps) {
  const seed = name?.trim() || email?.trim() || "Linea user"

  if (!image) {
    return (
      <PlayfulAvatar
        name={seed}
        shape="circle"
        className={cn(sizeClass[size], className)}
      />
    )
  }

  return (
    <Avatar size={size} className={cn(className)}>
      <AvatarImage src={image} alt="" />
      <AvatarFallback className="overflow-hidden p-0">
        <PlayfulAvatar name={seed} shape="circle" className="size-full" />
      </AvatarFallback>
    </Avatar>
  )
}

"use client"

import { LineaMark } from "@/components/linea-mark"
import Link from "next/link"
import type { ComponentProps } from "react"

export function DocsSidebarBanner({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`flex items-center gap-2 p-4 pb-2 md:hidden ${className ?? ""}`}
    >
      <Link
        href="/"
        className="flex min-w-0 flex-1 items-center gap-2 font-semibold"
      >
        <LineaMark />
        Linea Docs
      </Link>
      {children}
    </div>
  )
}

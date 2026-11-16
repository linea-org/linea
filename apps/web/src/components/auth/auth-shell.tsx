import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { Card } from "@linea/ui/components/card"

type AuthShellProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col bg-background p-2 text-foreground">
      <div className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-xl bg-linear-to-b from-stage-sky via-stage-mist to-stage-floor p-4 py-20">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-grain opacity-30 mix-blend-overlay"
        />
        <Link
          to="/"
          className="absolute top-5 left-5 flex items-center gap-2 text-stage-foreground sm:top-6 sm:left-6"
        >
          <img
            src="/assets/linea.svg"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-md"
          />
          <span className="text-base font-semibold tracking-tight">Linea</span>
        </Link>
        <Card className="w-full max-w-sm px-6 shadow-2xl">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </Card>
        {footer ? (
          <p className="text-center text-sm text-stage-floor-foreground [&_a]:font-medium [&_a]:text-stage-floor-foreground [&_a]:underline [&_a]:underline-offset-4">
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  )
}

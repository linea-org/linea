import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { cn } from "@linea/ui/lib/utils"

import { AuthGradientPanel } from "./auth-gradient-panel"

type AuthShellProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  steps?: { label: string; active?: boolean; done?: boolean }[]
  className?: string
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  steps,
  className,
}: AuthShellProps) {
  return (
    <section className="h-svh w-screen overflow-hidden bg-background text-foreground antialiased">
      <div className="grid h-full w-full lg:grid-cols-2">
        <div className="flex h-full items-center overflow-y-auto bg-card px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
          <div className={cn("mx-auto w-full max-w-md", className)}>
            <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
              <img
                src="/assets/linea.svg"
                alt="Linea"
                width={36}
                height={36}
                className="size-9 rounded ring-1 ring-black/5"
              />
              <span className="font-heading text-xl font-semibold tracking-tight">
                Linea
              </span>
            </Link>

            {steps && steps.length > 0 ? (
              <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                {steps.map((step, index) => (
                  <li key={step.label} className="flex items-center gap-2">
                    {index > 0 ? (
                      <span className="mx-0.5 h-px w-5 bg-border" aria-hidden />
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1",
                        step.active && "bg-primary/10 text-primary",
                        step.done && !step.active && "text-foreground",
                        !step.active && !step.done && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-base">
                {description}
              </p>
            ) : null}

            <div className="mt-8">{children}</div>

            {footer ? (
              <div className="mt-8 text-xs text-muted-foreground">{footer}</div>
            ) : null}
          </div>
        </div>

        <AuthGradientPanel />
      </div>
    </section>
  )
}

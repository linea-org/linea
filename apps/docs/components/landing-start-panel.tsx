import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

const steps = [
  {
    title: "Run Linea locally",
    description: "Set up your environment and start the platform.",
    href: "/docs/getting-started",
  },
  {
    title: "Follow an execution",
    description: "Trace a request through workers and checkpoints.",
    href: "/docs/architecture/execution-flow",
  },
  {
    title: "Make your first change",
    description: "Find your way around the code and contribute.",
    href: "/docs/contributing",
  },
]

export function LandingStartPanel() {
  return (
    <aside aria-label="Start here" className="mt-12 sm:mt-14">
      <nav
        aria-label="Getting started with Linea"
        className="grid gap-2 md:grid-cols-3 md:gap-4"
      >
        {steps.map((step, index) => (
          <Link
            key={step.href}
            href={step.href}
            className="group border-fd-border bg-fd-card/30 hover:border-fd-primary/50 hover:bg-fd-card focus-visible:outline-fd-ring flex items-start gap-3 rounded-lg border px-4 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span className="text-fd-muted-foreground pt-0.5 font-mono text-xs">
              0{index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-fd-muted-foreground mt-1 text-sm leading-6">
                {step.description}
              </p>
            </div>
            <ArrowUpRight
              aria-hidden="true"
              className="text-fd-muted-foreground group-hover:text-fd-foreground mt-0.5 size-4 shrink-0"
            />
          </Link>
        ))}
      </nav>
    </aside>
  )
}

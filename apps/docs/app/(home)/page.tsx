import { LandingStartPanel } from "@/components/landing-start-panel"
import { LandingResources } from "@/components/landing-resources"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="pt-12 sm:pt-16 lg:pt-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl leading-[1.12] font-semibold tracking-[-0.045em] text-balance sm:text-5xl lg:text-6xl">
              The runtime for production agents.
            </h1>
            <p className="text-fd-muted-foreground mx-auto mt-6 max-w-2xl text-lg leading-8 text-pretty">
              Run agents, keep their state, and pick up where they left off.
              Learn how Linea works, integrate with the API, and build with
              confidence.
            </p>
            <div className="mt-8 flex items-center justify-center gap-2">
              <Link
                href="/docs/getting-started"
                className="bg-fd-primary text-fd-primary-foreground focus-visible:outline-fd-ring inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-4"
              >
                Get started
                <ArrowRight
                  className="hidden size-4 sm:block"
                  aria-hidden="true"
                />
              </Link>
              <Link
                href="/docs/architecture"
                className="border-fd-border bg-fd-background hover:bg-fd-accent focus-visible:outline-fd-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-4"
              >
                <span className="sm:hidden">Architecture</span>
                <span className="hidden sm:inline">
                  Explore the architecture
                </span>
              </Link>
            </div>
          </div>
          <LandingStartPanel />
        </div>
      </section>
      <LandingResources />
    </main>
  )
}

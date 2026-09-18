import { LineaMark } from "@/components/linea-mark"
import Link from "next/link"

const linkGroups = [
  {
    title: "Documentation",
    links: [
      { title: "Getting started", href: "/docs/getting-started" },
      { title: "Architecture", href: "/docs/architecture" },
      { title: "API reference", href: "/docs/api" },
      { title: "Security", href: "/docs/security" },
    ],
  },
  {
    title: "Build with us",
    links: [
      { title: "Contributing", href: "/docs/contributing" },
      { title: "Repository map", href: "/docs/architecture/repository-map" },
      { title: "Architecture decisions", href: "/docs/decisions" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-fd-background">
      <div className="mx-auto w-full max-w-6xl px-6">
        <hr className="border-fd-border m-0 border-0 border-t" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-6 pt-8 pb-6 sm:pt-10 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr] md:gap-x-10 md:pb-8">
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="focus-visible:outline-fd-ring inline-flex items-center gap-2.5 rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <LineaMark />
              Linea
              <span className="text-fd-muted-foreground font-normal">
                / Docs
              </span>
            </Link>
            <p className="text-fd-muted-foreground mt-3 max-w-xs text-sm leading-6">
              The runtime that remembers.
            </p>
          </div>
          {linkGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <ul className="mt-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-fd-muted-foreground hover:text-fd-foreground focus-visible:outline-fd-ring inline-flex min-h-9 items-center rounded-sm py-1 text-sm leading-5 transition-colors hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="text-fd-muted-foreground py-3 text-center text-xs">
          <p>© {new Date().getFullYear()} Linea. Built in the open.</p>
        </div>
      </div>
    </footer>
  )
}

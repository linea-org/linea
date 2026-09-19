import Link from "next/link"

type DocsLinkItem = {
  title: string
  href: string
  description?: string
}

export function DocsLinks({ items }: { items: DocsLinkItem[] }) {
  return (
    <nav className="not-prose my-6 flex flex-col">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="border-fd-border group border-t py-3 last:border-b"
        >
          <p className="font-display group-hover:text-fd-primary font-semibold tracking-tight">
            {item.title}
          </p>
          {item.description && (
            <p className="text-fd-muted-foreground mt-1 text-sm leading-6">
              {item.description}
            </p>
          )}
        </Link>
      ))}
    </nav>
  )
}

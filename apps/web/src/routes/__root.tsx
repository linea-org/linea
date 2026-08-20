import { useState } from "react"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import appCss from "@linea/ui/globals.css?url"

import { ThemeProvider } from "../components/theme"
import { createQueryClient } from "../lib/query-client"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Linea",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/assets/linea.svg",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-2 p-6">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <p className="text-xs text-muted-foreground">
        The page you’re looking for doesn’t exist.
      </p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh font-sans antialiased">
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

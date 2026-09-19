import "./global.css"
import { DocsSearchDialog } from "@/components/docs-search-dialog"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.getlinea.app"),
  title: {
    default: "Linea Docs",
    template: "%s | Linea Docs",
  },
  description:
    "Build and operate production agents. Architecture, API, and security for the runtime that remembers.",
  icons: "/assets/linea.svg",
}

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider search={{ SearchDialog: DocsSearchDialog }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}

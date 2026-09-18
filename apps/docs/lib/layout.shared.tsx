import { LineaMark } from "@/components/linea-mark"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { BookOpen, Code2, ShieldCheck } from "lucide-react"
import { gitConfig } from "./shared"

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`

function navTitle(separated: boolean) {
  return (
    <span
      className={`flex items-center gap-2 font-semibold ${separated ? "sm:border-fd-border sm:border-e sm:pe-6" : ""}`}
    >
      <LineaMark />
      Linea Docs
    </span>
  )
}

export function homeOptions(): BaseLayoutProps {
  return {
    nav: {
      title: navTitle(true),
    },
    githubUrl,
    links: [
      {
        text: "Architecture",
        url: "/docs/architecture",
        icon: <BookOpen />,
      },
      {
        text: "API",
        url: "/docs/api",
        icon: <Code2 />,
      },
      {
        text: "Security",
        url: "/docs/security",
        icon: <ShieldCheck />,
      },
    ],
  }
}

export function docsOptions(): BaseLayoutProps {
  return {
    nav: {
      title: navTitle(false),
    },
  }
}
